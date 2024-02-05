const express = require('express')
const verifier = require('@gradeup/email-verify')
const bcrypt = require('bcrypt')
const app = express()
require('dotenv').config()
const port = process.env.PORT || 3000
const {v4: uuidv4} = require('uuid');
const {verifyEmailDomain} = require('email-domain-verifier');

// Add Swagger UI
const swaggerUi = require('swagger-ui-express');
const yamlJs = require('yamljs');
const swaggerDocument = yamlJs.load('./swagger.yml');
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
const expressWs = require('express-ws')(app);

app.use(express.static('public'))
app.use(express.json())

const users = [
    {id: 1, email: 'ads@ads.com', password: '$2b$10$EvcXbnHTf2jRatLGWYx8GOCAs8pR1ThB7PRpmP9m5AfQphtqY/BRq\n'}
]

let sessions = [
    {id: '123', userId: 1}
]

const products = [
    {id: 1, name: 'Product 1', description: 'Description 1', price: 100, userId: 1},
    {id: 2, name: 'Product 2', description: 'Description 2', price: 200, userId: 1},
    {id: 3, name: 'Product 3', description: 'Description 3', price: 300, userId: 2},
]

function tryToParseJSON(jsonString) {
    try {
        let o = JSON.parse(jsonString)
        if (o && typeof o === 'object') {
            return o;
        }
    } catch (e) {
    }
    return false;
}

app.post('/users', async (req, res) => {

    // Validate email and password
    if (!req.body.email || !req.body.password) return res.status(400).send('Email and password are required')
    if (req.body.password.length < 8) return res.status(400).send('Password must be at least 8 characters long')
    if (!req.body.email.match(/^[+a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}$/)) return res.status(400).send('Email must be in a valid format')

    // Check if email is already in use
    if (users.find(user => user.email === req.body.email)) return res.status(409).send('Email is already in use')

    // Try to contact the mail server and send a test email without actually sending the email
    /*try {
        const result = await verifyEmail(req.body.email);
        if (!result.success) {
            return res.status(400).send('Email is not valid:' + result.info)
        }
        console.log('Email is valid')
    } catch (error) {
        const errorObject = tryToParseJSON(error);
        if (errorObject && errorObject.info) {
            return res.status(400).send('Email is not valid: ' + errorObject.info)
        }
        return res.status(400).send('Email is not valid:' + error.code)
    }*/

    // Hash password
    let hashedPassword
    try {
        hashedPassword = await bcrypt.hash(req.body.password, 10);
    } catch (error) {
        console.log(error);
    }

    // Find max id
    const maxId = users.reduce((max, user) => user.id > max ? user.id : max, 0)

    // Save user to database
    users.push({id: maxId + 1, email: req.body.email, password: hashedPassword})

    res.status(201).end()
});

// POST /sessions
app.post('/sessions', async (req, res) => {

    // Validate email and password
    if (!req.body.email || !req.body.password) return res.status(400).send('Email and password are required')

    // Find user
    const user = users.find(user => user.email === req.body.email)
    if (!user) return res.status(400).send('User not found')

    // Compare password
    try {
        if (await bcrypt.compare(req.body.password, user.password)) {
            // Passwords match
            // create session
            const session = {id: uuidv4(), userId: user.id}

            // add session to sessions array
            sessions.push(session)

            // send session to client
            res.status(200).send(session)
        } else {
            // Passwords don't match
            res.status(400).send('Password is incorrect')
        }
    } catch (error) {
        console.error(error);
        res.status(500).send('Internal server error')
    }
})

function authorizeRequest(req, res, next) {
    // Check that there is an authorization header
    if (!req.headers.authorization) return res.status(401).send('Missing authorization header')

    // Check that the authorization header is in the correct format
    const authorizationHeader = req.headers.authorization.split(' ')
    if (authorizationHeader.length !== 2 || authorizationHeader[0] !== 'Bearer') return res.status(401).send('Invalid authorization header')

    // Get sessionId from authorization header
    const sessionId = authorizationHeader[1]

    // Find session
    const session = sessions.find(session => session.id === sessionId)
    if (!session) return res.status(401).send('Invalid session')

    //Check that the user exists
    const user = users.find(user => user.id === session.userId)
    if (!user) return res.status(401).send('Invalid session')

    // Add user to request
    req.user = user

    // Add session to request
    req.session = session

    // Call next middleware
    next()
}

app.get('/products', authorizeRequest, (req, res) => {
    const productsForUser = products.filter(product => product.userId === req.user.id)
    res.send(productsForUser)
})

app.post('/products', authorizeRequest, (req, res) => {
    // Validate name and price)
    if (!req.body.name || !req.body.price) return res.status(400).send('Name and price are required')
    if (typeof req.body.name !== 'string') return res.status(400).send('Name must be a string')
    if (typeof req.body.price !== 'number') return res.status(400).send('Price must be a number')
    if (req.body.price < 0) return res.status(400).send('Price must be a positive number')

    // find max id
    const maxId = products.reduce((max, product) => product.id > max ? product.id : max, 0)

    // save product to database
    const product = {id: maxId + 1, name: req.body.name, description: req.body.description, price: req.body.price}

    // add product to products array
    products.push({id: maxId + 1, name: req.body.name, description: req.body.description, price: req.body.price, userId: req.user.id})

    // send product to client
    res.status(201).send(product[products.length - 1]);
})

app.put('/products/:id', authorizeRequest, (req, res) => {

    // Validate name, description and price
    if (!req.body.name || !req.body.description || !req.body.price) return res.status(400).send('Name, description and price are required')

    // Find product in database
    const product = products.find(product => product.id === parseInt(req.params.id))
    if (!product) return res.status(404).send('Product not found')

    // Check that the product belongs to the user
    if (product.userId !== req.user.id) return res.status(401).send('Unauthorized')

    // Update product
    product.name = req.body.name
    product.description = req.body.description
    product.price = req.body.price

    // Send product to client
    res.send(product)
})

app.delete('/products/:id', authorizeRequest, (req, res) => {
    // Find product
    const product = products.find(product => product.id === parseInt(req.params.id))
    if (!product) return res.status(404).send('Product not found')

    // Check that the product belongs to the user
    if (product.userId !== req.user.id) return res.status(401).send('Unauthorized')

    // Remove product from products array
    products.splice(products.indexOf(product), 1)

    // Send delete event to clients
    //expressWs.getWss().clients.forEach(client => client.send(JSON.stringify({type: 'delete', id: product.id})));

    res.status(204).end()
})

app.delete('/sessions', authorizeRequest, (req, res) => {

    // Remove session from sessions array
    sessions = sessions.filter(session => session.id !== req.session.id)

    res.status(204).end()
})

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})

function verifyEmail(email) {
    return new Promise((resolve, reject) => {
        verifier.verify(email, (err, info) => {
            console.log(err, info);
            if (err) {
                reject(JSON.stringify(info));
            } else {
                resolve(info);
            }
        });
    });
}