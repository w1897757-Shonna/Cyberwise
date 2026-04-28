const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const OpenAI = require("openai");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const app = express();
const PORT = process.env.PORT || 5001;
const JWT_SECRET = process.env.JWT_SECRET;

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Connect to PostgreSQL database using a connection pool
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Make sure the uploads folder exists before we try to save anything into it
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// Set up multer to handle image uploads — max 10MB, images only
const upload = multer({
  dest: uploadsDir,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"];
    allowed.includes(file.mimetype) ? cb(null, true) : cb(new Error("Only image files are allowed."));
  },
});

app.use(cors());
app.use(express.json({ limit: "2mb" }));

// Quietly delete a file after we're done with it — ignores errors if it's already gone
function safeDelete(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.error("File delete error:", err.message);
  }
}

// Checks that the request has a valid JWT before letting it through
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer "))
    return res.status(401).json({ message: "No token provided." });

  const token = authHeader.split(" ")[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

// Just a quick check to confirm the server is up and running
app.get("/", (req, res) => res.send("CyberWise backend is running"));

// Creates a new user account, hashes their password, and gives them a token straight away
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields are required." });

    if (password.length < 6)
      return res.status(400).json({ message: "Password must be at least 6 characters." });

    const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
    if (existing.rows.length > 0)
      return res.status(400).json({ message: "An account with this email already exists." });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await db.query(
      "INSERT INTO users (name, email, password) VALUES ($1, $2, $3) RETURNING id",
      [name, email, hashedPassword]
    );

    const userId = result.rows[0].id;
    await db.query(
      "INSERT INTO profiles (user_id, name, email, joined) VALUES ($1, $2, $3, $4)",
      [userId, name, email, new Date().toISOString().split('T')[0]]
    );
    await db.query("INSERT INTO progress (user_id) VALUES ($1)", [userId]);

    const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: "7d" });

    res.status(201).json({
      message: "Account created successfully.",
      token,
      user: { id: userId, name, email }
    });
  } catch (error) {
    console.error("Register error:", error);
    res.status(500).json({ message: "Registration failed." });
  }
});

// Checks the email and password, then hands back a token if everything matches
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password)
      return res.status(400).json({ message: "Email and password are required." });

    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    const user = result.rows[0];

    if (!user)
      return res.status(400).json({ message: "No account found with this email." });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Incorrect password." });

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: "7d" });

    res.json({
      message: "Login successful.",
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed." });
  }
});

// Returns the basic details of whoever is currently logged in
app.get("/api/auth/me", authMiddleware, async (req, res) => {
  try {
    const result = await db.query(
      "SELECT id, name, email, created_at FROM users WHERE id = $1",
      [req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "User not found." });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Failed to get user." });
  }
});

// Sends the user's message to GPT and saves the reply to the reports table
app.post("/api/chat", async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ reply: "No message sent." });

    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        userId = decoded.userId;
      } catch {}
    }

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are CyberWise Assistant, a warm, friendly and patient helper for older adults learning to stay safe online.

Your personality:
- Talk like a kind, trusted friend — not a robot or a report
- Use simple, everyday language that anyone can understand — no jargon
- Keep answers short and clear — 3 to 5 sentences at most unless the person really needs more detail
- Be encouraging and reassuring — never make the person feel silly for asking
- If someone greets you, greet them back warmly and ask how you can help

When someone asks about a suspicious message, email, text, phone call or link:
- Explain clearly and simply what it looks like and why it might or might not be a concern
- Tell them exactly what to do next in plain English
- Be reassuring — most people just need calm, clear guidance

When someone shares a link or web address and asks if it is safe:
- Give a straightforward friendly answer — for example "That looks fine to me!" or "I would be careful with that one"
- Explain in one or two simple sentences why you think so
- Tell them what to do — for example "It is safe to visit" or "I would not click on that"
- Do not use technical terms, scores, labels or categories

Never use headings, bullet points, or structured formats in your reply.
Just write naturally, like a friendly person talking to them.
          `
        },
        { role: "user", content: message },
      ],
    });

    const reply = response.choices[0].message.content || "Sorry, I could not generate a response.";

    const riskMatch = reply.match(/Risk Level:\s*(low|medium|high)/i);
    const categoryMatch = reply.match(/Category:\s*(.+)/i);
    const riskLevel = riskMatch ? riskMatch[1].toLowerCase() : "unknown";
    const category = categoryMatch ? categoryMatch[1].split("\n")[0].trim() : "general";

    const result = await db.query(
      "INSERT INTO reports (user_id, type, user_input, ai_reply, risk_level, category) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [userId, "chat", message, reply, riskLevel, category]
    );

    res.json({
      reply,
      savedReport: { id: result.rows[0].id, userId, type: "chat", riskLevel, category }
    });
  } catch (error) {
    console.error("Chat error:", error.message);
    res.status(500).json({ reply: "Sorry, something went wrong. Please try again." });
  }
});

// Reads the uploaded image, sends it to GPT vision, and saves the result
app.post("/api/analyze-image", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ reply: "No image uploaded." });

    let userId = null;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      try {
        const decoded = jwt.verify(authHeader.split(" ")[1], JWT_SECRET);
        userId = decoded.userId;
      } catch {}
    }

    const filePath = req.file.path;
    const base64Image = fs.readFileSync(filePath, { encoding: "base64" });

    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `
You are CyberWise Assistant, a warm and friendly helper for older adults learning to stay safe online.

Look at the uploaded image and tell the person in simple, plain English whether it looks suspicious or safe.

- Talk like a kind, trusted friend — not a formal report
- Use simple everyday language — no jargon or technical terms
- Keep your answer to 3 to 5 sentences
- Tell them clearly what you can see and what they should do about it
- Be calm and reassuring — do not alarm them unnecessarily
- Do not use bullet points, headings or labels — just write naturally
          `
        },
        {
          role: "user",
          content: [
            { type: "text", text: "Please look at this image and tell me if it looks like a scam or if it is safe." },
            {
              type: "image_url",
              image_url: { url: `data:${req.file.mimetype};base64,${base64Image}` }
            },
          ],
        },
      ],
      max_tokens: 500,
    });

    const reply = response.choices[0].message.content || "I could not analyse that image.";

    const riskMatch = reply.match(/Risk Level:\s*(low|medium|high)/i);
    const categoryMatch = reply.match(/Category:\s*(.+)/i);
    const riskLevel = riskMatch ? riskMatch[1].toLowerCase() : "unknown";
    const category = categoryMatch ? categoryMatch[1].split("\n")[0].trim() : "general";

    const result = await db.query(
      "INSERT INTO reports (user_id, type, image_name, ai_reply, risk_level, category) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id",
      [userId, "image", req.file.originalname, reply, riskLevel, category]
    );

    safeDelete(filePath);
    res.json({
      reply,
      savedReport: { id: result.rows[0].id, userId, type: "image", riskLevel, category }
    });
  } catch (error) {
    console.error("Image analysis error:", error.message);
    if (req.file) safeDelete(req.file.path);
    res.status(500).json({ reply: "Sorry, I could not analyse that image. Please try again." });
  }
});

// Fetches the profile for whoever is logged in
app.get("/api/profile", authMiddleware, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM profiles WHERE user_id = $1", [req.userId]);
    if (!result.rows[0]) return res.status(404).json({ message: "Profile not found." });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Failed to fetch profile." });
  }
});

// Saves any changes the user made to their name, email or join date
app.put("/api/profile", authMiddleware, async (req, res) => {
  try {
    const { name, email, joined } = req.body;
    await db.query(
      "UPDATE profiles SET name = $1, email = $2, joined = $3 WHERE user_id = $4",
      [name, email, joined, req.userId]
    );
    const result = await db.query("SELECT * FROM profiles WHERE user_id = $1", [req.userId]);
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Failed to update profile." });
  }
});

// Returns the current progress record for the logged-in user
app.get("/api/progress", authMiddleware, async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM progress WHERE user_id = $1", [req.userId]);
    if (!result.rows[0]) return res.status(404).json({ message: "Progress not found." });
    res.json(result.rows[0]);
  } catch {
    res.status(500).json({ message: "Failed to fetch progress." });
  }
});

// Updates whichever progress fields were sent — leaves everything else untouched
app.put("/api/progress", authMiddleware, async (req, res) => {
  try {
    const {
      phoneScams, doorstepScams, relationshipScams, shoppingScams, quizCompleted, quizScore,
      phone_module, doorstep_module, relationship_module, mail_module, identity_module,
      investment_module, business_module, textmsg_module, buying_module,
      phone_quiz, doorstep_quiz, relationship_quiz, mail_quiz, identity_quiz,
      business_quiz, textmsg_quiz, buying_quiz
    } = req.body;

    await db.query(
      `UPDATE progress SET
        phone_scams = COALESCE($1, phone_scams),
        doorstep_scams = COALESCE($2, doorstep_scams),
        relationship_scams = COALESCE($3, relationship_scams),
        shopping_scams = COALESCE($4, shopping_scams),
        quiz_completed = COALESCE($5, quiz_completed),
        quiz_score = COALESCE($6, quiz_score),
        phone_module = COALESCE($7, phone_module),
        doorstep_module = COALESCE($8, doorstep_module),
        relationship_module = COALESCE($9, relationship_module),
        mail_module = COALESCE($10, mail_module),
        identity_module = COALESCE($11, identity_module),
        investment_module = COALESCE($12, investment_module),
        business_module = COALESCE($13, business_module),
        textmsg_module = COALESCE($14, textmsg_module),
        buying_module = COALESCE($15, buying_module),
        phone_quiz = COALESCE($16, phone_quiz),
        doorstep_quiz = COALESCE($17, doorstep_quiz),
        relationship_quiz = COALESCE($18, relationship_quiz),
        mail_quiz = COALESCE($19, mail_quiz),
        identity_quiz = COALESCE($20, identity_quiz),
        business_quiz = COALESCE($21, business_quiz),
        textmsg_quiz = COALESCE($22, textmsg_quiz),
        buying_quiz = COALESCE($23, buying_quiz)
      WHERE user_id = $24`,
      [
        phoneScams, doorstepScams, relationshipScams, shoppingScams, quizCompleted, quizScore,
        phone_module, doorstep_module, relationship_module, mail_module, identity_module,
        investment_module, business_module, textmsg_module, buying_module,
        phone_quiz, doorstep_quiz, relationship_quiz, mail_quiz, identity_quiz,
        business_quiz, textmsg_quiz, buying_quiz,
        req.userId
      ]
    );

    const result = await db.query("SELECT * FROM progress WHERE user_id = $1", [req.userId]);
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Progress update error:", err);
    res.status(500).json({ message: "Failed to update progress." });
  }
});

// Catches any errors thrown by multer during file uploads and returns a clean message
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE")
      return res.status(400).json({ error: "Image is too large. Please upload an image smaller than 10MB." });
    return res.status(400).json({ error: err.message });
  }
  if (err) return res.status(400).json({ error: err.message || "Upload failed." });
  next();
});

// Lets a user reset their password using just their email — no token needed
app.post("/api/auth/forgot-password", async (req, res) => {
  const { email, newPassword } = req.body;

  if (!email || !newPassword)
    return res.status(400).json({ message: "Email and new password are required." });

  if (newPassword.length < 6)
    return res.status(400).json({ message: "Password must be at least 6 characters." });

  try {
    const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
    if (!result.rows[0])
      return res.status(404).json({ message: "No account found with this email." });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password = $1 WHERE email = $2", [hashed, email]);

    res.json({ message: "Password reset successfully." });
  } catch (err) {
    console.error("Forgot password error:", err);
    res.status(500).json({ message: "Something went wrong." });
  }
});

// Lets a logged-in user change their password after confirming the current one
app.put("/api/auth/change-password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword)
    return res.status(400).json({ message: "All fields are required." });

  if (newPassword.length < 6)
    return res.status(400).json({ message: "New password must be at least 6 characters." });

  try {
    const result = await db.query("SELECT * FROM users WHERE id = $1", [req.userId]);
    const user = result.rows[0];

    if (!user)
      return res.status(404).json({ message: "User not found." });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch)
      return res.status(400).json({ message: "Current password is incorrect." });

    const hashed = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password = $1 WHERE id = $2", [hashed, req.userId]);

    res.json({ message: "Password updated successfully." });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({ message: "Something went wrong." });
  }
});

// Start listening for incoming requests
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});