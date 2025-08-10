require('dotenv').config();
const express=require('express')
const cors=require('cors')
const { MongoClient, ServerApiVersion } = require('mongodb');
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
    //await client.connect();
  
    foodCollection = client.db("FridgeDB").collection("foods"); 

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

   // GET data for fridge page
   app.get("/fridge-foods", async (req, res) => {
  try {
    const allFoods = await foodCollection.find().sort({ addedDate: -1 }).toArray();
    res.send(allFoods);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch food items", error });
  }
});

// GET /api/foods/:id
const { ObjectId } = require('mongodb');

app.get("/api/foods/:id", async (req, res) => {
  const { id } = req.params;
  try {
    const food=await foodCollection.findOne({ _id: new ObjectId(id) });
    if (!food) return res.status(404).send("Not Found");
    res.send(food);
  } catch (err) {
    res.status(500).send("Server error: " + err.message);
  }
});

//Post add food to foods collection in db
app.post("/api/foods", async (req, res) =>{
  const food=req.body;
  food.addedDate = new Date();
  food.notes = []; 
  try{
    const result=await foodCollection.insertOne(food);
    res.send(result);
  } catch (error){
    res.status(500).send({ message: "Failed to add food", error });
  }
});

//Get data My Items page 
app.get("/api/foods", async (req, res) => {
  const userEmail=req.query.email
      if (!userEmail) return res.status(400).send({message: 'Email is required.'})

      const result = await foodCollection.find({userEmail})
      .toArray()
      res.send(result)
    })
//Update
app.put("/api/foods/:id", async (req, res) => {
  const id=req.params.id
  const updateItem=req.body

  const result=await foodCollection.updateOne(
    {_id: new ObjectId(id)},
    {$set: updateItem}
  )
  res.send(result)
})
//Delete
app.delete("/api/foods/:id", async (req, res) => {
  const id=req.params.id
  const result= await foodCollection.deleteOne({_id: new ObjectId(id)})
  res.send(result)
})

//Post note to a food item
app.post("/api/foods/:id/notes", async (req, res) => {
  const { id } = req.params;
  const { text, date, userEmail } = req.body;

  if (!text || !date || !userEmail) {
    return res.status(400).send({ message: "Missing required fields" });
  }
  try {
    const food = await foodCollection.findOne({ _id: new ObjectId(id) });
    if (!food) {
      return res.status(404).send({ message: "Food item not found" });
    }
    if (food.userEmail !== userEmail) {
      return res.status(403).send({ message: "Unauthorized to add a note to this food item" });
    }

    if (!Array.isArray(food.notes)) {
      await foodCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: { notes: [] } }
      );
    }

    const result = await foodCollection.updateOne(
      { _id: new ObjectId(id) },
      {
        $push: { notes: { text, date } }
      }
    );

    res.send({ success: true, modifiedCount: result.modifiedCount });
  } catch (error) {
    console.error("Error adding note:", error);
    res.status(500).send({ message: "Failed to add note", error });
  }
});

//Analytics
app.get("/analytics/summary", async (req, res) => {
  try {
    // today as YYYY-MM-DD (same format you're using in other endpoints)
    const today = new Date().toISOString().split("T")[0];

    // total items
    const totalCount = await foodCollection.countDocuments();

    // expired count: expiryDate < today
    const expiredCountAgg = await foodCollection.aggregate([
      {
        $match: {
          expiryDate: { $lt: today }
        }
      },
      { $count: "expiredCount" }
    ]).toArray();
    const expiredCount = (expiredCountAgg[0] && expiredCountAgg[0].expiredCount) || 0;

    // saved count
    const savedCount = Math.max(0, totalCount - expiredCount);

    // items by category (counts)
    const categoryAgg = await foodCollection.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
    // convert to object or arrays
    const itemsByCategory = {};
    categoryAgg.forEach((c) => {
      const key = c._id || "Uncategorized";
      itemsByCategory[key] = c.count;
    });

    // expired by category
    const expiredByCategoryAgg = await foodCollection.aggregate([
      { $match: { expiryDate: { $lt: today } } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
    const expiredByCategory = {};
    expiredByCategoryAgg.forEach((c) => {
      const key = c._id || "Uncategorized";
      expiredByCategory[key] = c.count;
    });

    res.send({
      totalCount,
      expiredCount,
      savedCount,
      itemsByCategory,
      expiredByCategory,
    });
  } catch (error) {
    console.error("Analytics error:", error);
    res.status(500).send({ message: "Failed to compute analytics", error });
  }
});



    // Send a ping to confirm a successful connection
    //await client.db("admin").command({ ping: 1 });
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
