
CyberWise is a web application designed to help older adults stay safe online. It uses AI to analyse suspicious messages, emails, links, and images, and gives friendly, plain-English advice on whether something looks like a scam.


# Features

- Register and log in securely
- Chat with an AI assistant about suspicious messages or links
- Upload images to get an AI safety analysis
- Progress tracking across learning modules and quizzes
- All data saved securely to a MySQL database
- Passwords hashed with bcrypt — never stored in plain text
- JWT authentication to protect user data


# Tech Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Database: MySQL
- AI: OpenAI GPT-4o-mini
- Auth:JWT (JSON Web Tokens)
- Password Hashing:bcryptjs


# Project Structure

```
WEBSITE/
├── README.md
├── backend/
│   ├── middleware/
│   │   └── auth.js
│   ├── routes/
│   │   ├── auth.js
│   │   └── chat.js
│   ├── uploads/
│   ├── .env
│   ├── .gitignore
│   ├── db.js
│   ├── package.json
│   ├── package-lock.json
│   ├── schema.sql
│   └── server.js
└── html+css/
    ├── images/
    ├── allpage.js
    ├── allpages.css
    ├── becquiz.html
    ├── becscam.html
    ├── bscvid.html
    ├── buyingscamquiz.html
    ├── buyingscams.html
    ├── buyingscamvid.html
    ├── chatbot.html
    ├── dashboard.html
    ├── doorstep.html
    ├── doorstepquiz.html
    ├── doorstepvid.html
    ├── forgotpwd.html
    ├── identityscamquiz.html
    ├── identityscamvid.html
    ├── identitytheftsm.html
    ├── IPsm.html
    ├── IPsmquiz.html
    ├── IPsmvid.html
    ├── Login.html
    ├── mailsm.html
    ├── mailsquiz.html
    ├── mailsvid.html
    ├── modules.html
    ├── newalerts.html
    ├── phonequiz.html
    ├── phonesm.html
    ├── phonevideo.html
    ├── profile.html
    ├── progress.html
    ├── quizzes.html
    ├── register.html
    ├── relationshipsm.html
    ├── relationshipvideo.html
    ├── relationshipquiz.html
    ├── spotaigame.html
    ├── spotscam.html
    ├── textmsg.html
    ├── textmsgquiz.html
    └── textmsgvid.html
```



# Prerequisites

Make sure you have the following installed:

- [Node.js](https://nodejs.org/) (v18 or above)
- [MySQL](https://www.mysql.com/) (v8 or above)
- [Homebrew](https://brew.sh/) (Mac only, for installing MySQL)



# 1. Clone the Repository

```bash
git clone https://github.com/yourusername/your-repo-name.git
cd your-repo-name
```


# 2. Install MySQL (Mac)

```bash
brew install mysql
brew services start mysql
```



#  3. Set Up the Database

Run the schema file to create the database and all tables:

```bash
mysql -u root -p < backend/schema.sql
```


# 4. Configure Environment Variables

Create a `.env` file inside the `backend` folder:

```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=chatapp
JWT_SECRET=your_jwt_secret
OPENAI_API_KEY=your_openai_api_key
PORT=5001
```


# 5. Install Dependencies

```bash
cd backend
npm install
```



# 6. Start the Server

```bash
node server.js
```

The server will run at: `http://localhost:5001`


# 7. Open the Frontend

Open any HTML file in the `html+css` folder in your browser, or use a live server extension in VS Code.

---

#  Database Tables

| Table | Description |
|-------|-------------|
| `users` | Stores registered users with hashed passwords |
| `profiles` | Stores user profile information |
| `progress` | Tracks module and quiz completion per user |
| `reports` | Logs every chat message and image analysis |



#  API Endpoints

| Method | Endpoint | Description | Auth Required |
|--------|----------|-------------|---------------|
| POST | `/api/auth/register` | Register a new user | No |
| POST | `/api/auth/login` | Log in and receive a JWT token | No |
| GET | `/api/auth/me` | Get current logged-in user | Yes |
| POST | `/api/auth/forgot-password` | Reset password by email | No |
| PUT | `/api/auth/change-password` | Change password | Yes |
| POST | `/api/chat` | Send a message to the AI assistant | No |
| POST | `/api/analyze-image` | Upload an image for AI analysis | No |
| GET | `/api/profile` | Get user profile | Yes |
| PUT | `/api/profile` | Update user profile | Yes |
| GET | `/api/progress` | Get user progress | Yes |
| PUT | `/api/progress` | Update user progress | Yes |


# Security

- Passwords are hashed using **bcrypt** before being stored
- Authentication uses **JWT tokens** that expire after 7 days
- The `.env` file is excluded from version control via `.gitignore`
- Users can only access their own reports and profile data


# Viewing the Database

To view saved users:
```bash
mysql -u root -p chatapp -e "SELECT id, name, email, created_at FROM users;"
```

To view all reports:
```bash
mysql -u root -p chatapp -e "SELECT id, user_id, type, risk_level, created_at FROM reports;"
```

To view progress:
```bash
mysql -u root -p chatapp -e "SELECT * FROM progress;"
```