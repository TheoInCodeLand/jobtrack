const express = require('express');
const path = require('path');
const fs = require('fs');
const session = require('express-session');
require('dotenv').config();

const app = express();

const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)){
    fs.mkdirSync(uploadDir, { recursive: true });
}

app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true })); 
app.use(express.static(path.join(__dirname, 'public'))); 

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_key',
    resave: false,
    saveUninitialized: false
}));

app.use((req, res, next) => {
    res.locals.user = req.session.userName || null;
    next();
});

function checkAuth(req, res, next) {
    if (req.session.userId) {
        return next();
    }
    res.redirect('/auth/login');
}

app.use('/auth', require('./routes/auth'));
app.use('/ats', checkAuth, require('./routes/ats'));
app.use('/applications', checkAuth, require('./routes/applications'));

app.get('/', (req, res) => {
    res.render('index'); 
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}`);
});