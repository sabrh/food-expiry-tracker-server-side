const express=require('express')
const cors=require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();
const app=express()
const port=process.env.PORT || 3000

app.use(cors())
app.use(express.json())


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.lcrd7ak.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

let foodCollection;
async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();
  
    const foodCollection = client.db("FridgeDB").collection("foods"); 

    console.log("Connected to MongoDB!");

    // GET data for nearly expired foods
    app.get("/nearly-expired", async (req, res) => {
    const today = new Date();
    const fiveDaysLater = new Date();
    fiveDaysLater.setDate(today.getDate() + 5);

    const items = await foodCollection
      .find({
        expiryDate: {
          $gte: today.toISOString().split('T')[0],
          $lte: fiveDaysLater.toISOString().split('T')[0]
        }
      })
      .sort({ expiryDate: 1 }) // soonest expiring first
      .limit(6)
      .toArray();

    res.send(items);
  });

    // GET data for expired foods
    app.get("/expired-foods", async (req, res) => {
    const today = new Date().toISOString().split("T")[0]; // e.g., "2025-06-13"

    try {
      const expiredItems = await foodCollection
        .find({
          expiryDate: { $lt: today }
        })
        .sort({ expiryDate: -1 })
        .toArray();

      res.send(expiredItems);
    } catch (error) {
      res.status(500).send({ message: "Failed to fetch expired items", error });
    }
  });


    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    //await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req, res) =>{
    res.send("Server is starting.")
})

app.listen(port, () =>{
    console.log(`Server is running on port ${port}`)
})
