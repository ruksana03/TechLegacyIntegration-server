const express = require('express')
const app = express()
require('dotenv').config()
const cors = require('cors')
const cookieParser = require('cookie-parser')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
const jwt = require('jsonwebtoken')
const morgan = require('morgan')
const port = process.env.PORT || 5000
const stripe = require('stripe')(process.env.PAYMENT_SECRET_KEY)
// const nodemailer = require('nodemailer')

// middleware
const corsOptions = {
    origin: ['http://localhost:5173', 'http://localhost:5174', 'http://127.0.0.1:5173', 'http://127.0.0.1:5173/'],
    credentials: true,
    optionSuccessStatus: 200,
}
app.use(cors(corsOptions))
app.use(express.json())
app.use(cookieParser())
app.use(morgan('dev'))

const client = new MongoClient(process.env.DB_URI, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        const usersCollection = client.db('TLIdb').collection('users');
        const productsCollection = client.db('TLIdb').collection('products');
        const tagsCollection = client.db('TLIdb').collection('tags');
        const subscriptionsCollection = client.db('TLIdb').collection('subscriptions');

        // token verification api start 
        const verifyToken = async (req, res, next) => {
            const token = req.cookies?.token
            console.log(token)
            if (!token) {
                return res.status(401).send({ message: 'unauthorized access' })
            }
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    console.log(err)
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.user = decoded
                next()
            })
        }
        //token verification end 

        //jwt api start 
        app.post('/jwt', async (req, res) => {
            const user = req.body
            console.log('new jwt:', user)
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
                expiresIn: '365d',
            })
            res
                .cookie('token', token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                })
                .send({ success: true })
        })
        //jwt api end 

        // Logout api start
        app.get('/logout', async (req, res) => {
            try {
                res
                    .clearCookie('token', {
                        maxAge: 0,
                        secure: process.env.NODE_ENV === 'production',
                        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'strict',
                    })
                    .send({ success: true })
                console.log('Logout successful')
            } catch (err) {
                res.status(500).send(err)
            }
        })
        // logout api end 

        // Save  user email start
        app.put('/users/:email', async (req, res) => {
            const name = req.params.name
            const email = req.params.email
            const user = req.body
            const query = { email: email }
            const options = { upsert: true }
            const isExist = await usersCollection.findOne(query)
            console.log(isExist)
            if (isExist) return res.send(isExist)
            const result = await usersCollection.updateOne(
                query,
                {
                    $set: { name,...user, timestamp: Date.now() },
                },
                options
            )
            res.send(result)
        })
        // Save  user email end

        // get single user api with email start
        app.get('/user/email/:email', async (req, res) => {
            const email = req.params.email;
            const result = await usersCollection.findOne({ email });
            res.send(result);
        });
        // get single user api with email end

        // get single user by id api with id start
        app.get('/user/id/:id', async (req, res) => {
            const id = req.params.userId;
            const user = await usersCollection.findOne({ _id: new ObjectId(id) });
            res.send(user);
        });
        // get single user by id api with id end

        // get users api start
        app.get('/users', async (req, res) => {
            const result = await usersCollection.find().toArray();
            res.send(result);
        })
        // get users api end

        // update user role api start 
        app.put('/users/update/:email', async (req, res) => {
            const email = req.params.email
            const user = req.body
            const query = { email: email }
            const options = { upsert: true }
            const updateDoc = {
              $set: {
                ...user,
                timestamp: Date.now(),
              },
            }
            const result = await usersCollection.updateOne(query, updateDoc, options)
            res.send(result)
          })
        // update user role api end 

        // post Product api start 
        app.post('/products', async (req, res) => {
            const product = req.body;
            const result = await productsCollection.insertOne(product);
            res.send(result);
        })
        // post Product api end 

        // get single product by id start
        app.get('/product/:id', async (req, res) => {
            const id = req.params.id
            const result = await productsCollection.findOne({ _id: new ObjectId(id) });
            res.send(result);
        })
        // get single product by id start

        // get Product api start
        app.get('/products', async (req, res) => {
            const result = await productsCollection.find().toArray();
            res.send(result);
        })
        // get Product api end

        // strip payment api start 
        // Server route
        app.post('/create-checkout-session', async (req, res) => {
            try {
                const { payAmount } = req.body;
                const amount = parseInt(payAmount * 100);

                if (!payAmount || amount < 1) {
                    return res.status(400).json({ error: 'Invalid payment amount' });
                }

                const { client_secret } = await stripe.paymentIntents.create({
                    amount: amount,
                    currency: 'usd',
                    payment_method: 'card',
                });

                res.status(200).json({ clientSecret: client_secret });
            } catch (error) {
                console.error('Error creating checkout session:', error);
                res.status(500).json({ error: 'Internal server error' });
            }
        });
        // strip payment api end 

        // Save subscription info api start 
        app.post('/subscriptions', verifyToken, async (req, res) => {
            const subscription = req.body
            const result = await subscriptionsCollection.insertOne(subscription);
            res.send(result)
        })
        // Save subscription info api end

        // Update user subscription status api start
        app.patch('/user/subscribe/:id', async (req, res) => {
            const id = req.params.id
            const status = req.body.status
            const query = { _id: new ObjectId(id) }
            const updateDoc = {
                $set: {
                    subscribe: status,
                },
            }
            const result = await usersCollection.updateOne(query, updateDoc)
            res.send(result)
        })

        // Update user subscription status api end

        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
    }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Tech server is Running')
})

app.listen(port, () => {
    console.log(`server running on port: ${port}`);
})