import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";

const mongodbUri = process.env.MONGO_DB_CONNECT;
const app = express();
const port = "5000";
//middleware
app.use(cors());
app.use(express.json());

//mongo connection
const client = new MongoClient(mongodbUri);
export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.dir(err);
  }
}

const mongoDBConnection = await connectToMongoDB();
//mongo collections
const database = mongoDBConnection.db("Equiply");
const authenticateUserColl = database.collection("session");
const userDataColl = database.collection("user");

app.get("/", (req, res) => {
  res.send({ message: "server is running" });
});

app.post("/update-user-data", async (req, res) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];
  const isTokenValid = await authenticateUserColl.findOne({ token: token });
  if (!isTokenValid) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const userId = isTokenValid.userId;
  const submittedData = req.body;
  const result = await userDataColl.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: submittedData,
    },
  );
  res.send(result)
});

app.listen(port, () => {
  console.log("server is running on ", port);
});
