const express = require('express')
const app = express()
require('dotenv').config()
const port = process.env.PORT || 3000
const verifier = require('@gradeup/email-verify');

app.use(express.static('public'))

app.use(express.json())
app.post('/users', async (req, res) => {

    // Validate email and password
    if (!req.body.email || !req.body.password) return res.status(400).send('Email and password are required')
    if (req.body.password.length < 8) return res.status(400).send('Password must be at least 8 characters long')
    if (!req.body.email.match(/^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/)) return res.status(400).send('Email is invalid')

    // Try to contact the mail server and send a test email without actually sending the email

    try {
        const result = await verifyEmail(req.body.email);
        if (!result.success) {
            return res.status(400).send('Email is not valid:' + result.info)
        }
        console.log('Email is valid')
    } catch (error) {
        return res.status(400).send('Email is not valid:' + error.code)
    }
    res.status(291).send('User created')
});


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})
function verifyEmail(email) {
    return new Promise((resolve, reject) => {
        verifier.verify(email, (err, info) => {
            console.log(err, info);
            if (err) {
                reject(JSON.stringify(err));
            } else {
                resolve(info);
            }
        });
    });
}