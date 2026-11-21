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
const equipmentsSubmissionColl = database.collection("equipments");

app.get("/", (req, res) => {
  res.send({ message: "server is running" });
});

//! middleware for check user authentication
const verifyUser = async (req, res, next) => {
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
  const userId = { _id: new ObjectId(isTokenValid.userId) };
  const applicantUser = await userDataColl.findOne(userId);
  if (!applicantUser) {
    return res.status(401).send({ message: "Unauthorized" });
  }
  req.user = applicantUser;
  next();
};

//! handel submission request for to be provider ---------
app.post("/update-user-data", verifyUser, async (req, res) => {
  const userData = req.user;
  if (userData.role !== "none") {
    return res.status(403).send({ message: "Forbidden" });
  }

  const submittedData = req.body;
  const result = await userDataColl.updateOne(
    { _id: new ObjectId(userData._id) },
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

//! handel to be renter request data---------
app.post("/update-renter-data", verifyUser, async (req, res) => {
  const userData = req.user;
  if (userData.role !== "none") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const submittedData = req.body;
  const result = await userDataColl.updateOne(
    { _id: new ObjectId(userData._id) },
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
app.get("/get-all-applicant-data", verifyUser, async (req, res) => {
  const userData = req.user;

  if (userData.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const result = await userDataColl.find({ role: "pending" }).toArray();
  if (result) {
    res.send(result);
  } else {
    res.send({ message: "something went wrong" });
  }
});

//! application delete/approve request handler

const type = ["provider", "dismissRequest"];
app.patch("/set-user-role/:action", verifyUser, async (req, res) => {
  const applicantId = req.body.applicantId;
  const actionType = req.params.action;
  const userData = req.user;
  if (!type.includes(actionType)) {
    return res.status(400).send({ message: "Bad request" });
  }
  if (!applicantId || !actionType || !userData) {
    return res.status(400).send({ message: "Bad request" });
  }

  if (userData.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const updateApplicant = await userDataColl.updateOne(
    { _id: new ObjectId(applicantId) },
    {
      $set: {
        role: actionType,
      },
    },
  );
  if (updateApplicant.acknowledged) {
    res.send({ status: true, message: "Action is processed" });
  } else {
    res.send({ status: false, message: "something went wrong" });
  }
});

//! equepment application handel
app.post("/equipment-application", verifyUser, async (req, res) => {
  const submittedData = req.body;
  const userData = req.user;
  if (userData.role !== "provider") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const payload = {
    ...submittedData,
    status: "pending",
    creatorId: userData._id,
  };

  const result = await equipmentsSubmissionColl.insertOne(payload);
  if (result) {
    res.send(result);
  } else {
    res.send({ status: false, message: "something went wrong" });
  }
});

//! show equepment application lists created by owner
app.get("/equipment-application/list", verifyUser, async (req, res) => {
  const userData = req.user;
  if (userData.role !== "provider") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const result = await equipmentsSubmissionColl
    .find({
      creatorId: userData._id,
    })
    .toArray();
  if (result) {
    res.send(result);
  } else {
    res.send({ status: false, message: "something went wrong" });
  }
});

//! get equepment details for provider
app.get("/equipment-application/details/:id", verifyUser, async (req, res) => {
  const equepmentId = req.params.id;
  const userData = req.user;
  if (userData.role !== "provider") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const equepmentData = await equipmentsSubmissionColl.findOne({
    _id: new ObjectId(equepmentId),
  });
  if (!equepmentData) {
    res.send({ status: false, message: "No data found" });
  }
  if (!equepmentData.creatorId.equals(userData._id)) {
    return res.status(403).send({ message: "Forbidden" });
  }
  res.send(equepmentData);
});

//! update 

app.listen(port, () => {
  console.log("server is running on ", port);
});
