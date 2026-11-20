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
const sessionCollection = database.collection("session");
const userDataColl = database.collection("user");

app.get("/", (req, res) => {
  res.send({ message: "server is running" });
});

//! handel equipment submission request data---------
app.post("/update-user-data", async (req, res) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];
  const isTokenValid = await sessionCollection.findOne({ token: token });
  if (!isTokenValid) {
    return res.status(401).send({ message: "Unauthorized" });
  }

  const userId = isTokenValid.userId;

  const applicantUser = await userDataColl.findOne({
    _id: new ObjectId(userId),
  });
  if (applicantUser.role !== "none") {
    return res.status(403).send({ message: "Forbidden" });
  }

  const submittedData = req.body;
  const result = await userDataColl.updateOne(
    { _id: new ObjectId(userId) },
    {
      $set: submittedData,
    },
  );
  if (result.acknowledged) {
    res.send(result);
  } else {
    res.send({ message: "something went wrong" });
  }
});

//*----------------------------------------------------------------

//! handel renter request data---------
app.post("/update-renter-data", async (req, res) => {
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const isTokenValid = await sessionCollection.findOne({ token: token });
  if (!isTokenValid) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const validUserId = isTokenValid.userId;
  const applicantUser = await userDataColl.findOne({
    _id: new ObjectId(validUserId),
  });
  if (applicantUser.role !== "none") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const submittedData = req.body;
  const result = await userDataColl.updateOne(
    { _id: new ObjectId(validUserId) },
    {
      $set: submittedData,
    },
  );
  if (result.acknowledged) {
    res.send(result);
  } else {
    res.send({ message: "something went wrong" });
  }
});

//! get all applicant data
app.get("/get-all-applicant-data", async (req, res) => {
  // validation
  const header = req.headers.authorization;
  if (!header) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const token = header.split(" ")[1];
  if (!token) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const isTokenValid = await sessionCollection.findOne({ token: token });
  if (!isTokenValid) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  const validUserId = isTokenValid.userId;
  const applicantUser = await userDataColl.findOne({
    _id: new ObjectId(validUserId),
  });
  if (applicantUser.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }
  //-------------
  //logic
  const result = await userDataColl.find({ role: "pending" }).toArray();
  if (result) {
    res.send(result);
  } else {
    res.send({ message: "something went wrong" });
  }
});




app.listen(port, () => {
  console.log("server is running on ", port);
});
