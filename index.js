import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import Stripe from "stripe";
export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const mongodbUri = process.env.MONGO_DB_CONNECT;
const app = express();
const port = process.env.PORT || 5000;
//middleware
app.use(cors());

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
const paymentRecord = database.collection("paymentRecord");
const review = database.collection("review");

//! stripe webhook
app.post(
  "/api/webhooks/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const webhooksEvent = req.body;
    const signature = req.headers["stripe-signature"];
    let event;
    try {
      event = stripe.webhooks.constructEvent(
        webhooksEvent,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      console.error("Webhook Error:", error.message);
      return res.status(400).json({ message: "Webhook Error" });
    }
    if (
      event.type === "checkout.session.completed" &&
      event.data.object.payment_status === "paid"
    ) {
      const session = event.data.object;
      console.log(session);
      const metaData = session.metadata;
      const result = await paymentRecord.updateOne(
        { _id: new ObjectId(metaData.bookedId), payment: "pending" },
        {
          $set: {
            payment: "paid",
          },
        },
      );
      const updateProductQuantity = await equipmentsSubmissionColl.updateOne(
        { _id: new ObjectId(metaData.bookingProductId) },
        [
          {
            $set: {
              equipmentQuantity: {
                $toString: {
                  $subtract: [
                    { $toInt: "$equipmentQuantity" },
                    Number(metaData.quantity),
                  ],
                },
              },
            },
          },
        ],
      );
    }

    return res.status(200).json({
      received: true,
    });
  },
);

app.use(express.json());
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

// //! get equepment details for provider
// app.get("/equipment-application/details/:id", verifyUser, async (req, res) => {
//   const equepmentId = req.params.id;
//   const userData = req.user;
//   if (userData.role !== "provider") {
//     return res.status(403).send({ message: "Forbidden" });
//   }
//   const equepmentData = await equipmentsSubmissionColl.findOne({
//     _id: new ObjectId(equepmentId),
//   });
//   if (!equepmentData) {
//     res.send({ status: false, message: "No data found" });
//   }
//   if (!equepmentData.creatorId.equals(userData._id)) {
//     return res.status(403).send({ message: "Forbidden" });
//   }
//   res.send(equepmentData);
// });

//! update equepment application
const allowedRole = ["provider", "admin"];
app.put("/equipment-application/update/:id", verifyUser, async (req, res) => {
  const equepmentId = req.params.id;
  const userData = req.user;
  const updatedData = req.body;
  const fieldsToUpdate = {
    equipmentName: updatedData.equipmentName,
    equipmentCategory: updatedData.equipmentCategory,
    equipmentDescription: updatedData.equipmentDescription,
    equipmentBrand: updatedData.equipmentBrand,
    equipmentModel: updatedData.equipmentModel,
    equipmentCondition: updatedData.equipmentCondition,
    equipmentLocation: updatedData.equipmentLocation,
    equipmentPrice: updatedData.equipmentPrice,
    rentalType: updatedData.rentalType,
    equipmentQuantity: updatedData.equipmentQuantity,
    equipmentImage: updatedData.equipmentImage,
    equipmentTerms: updatedData.equipmentTerms,
  };

  if (!equepmentId || !userData || !updatedData) {
    return res.status(400).send({ message: "Bad request" });
  }
  if (!allowedRole.includes(userData.role)) {
    return res.status(403).send({ message: "Forbidden" });
  }
  //* if user is admin-->
  if (userData.role === "admin") {
    const isReallyAdmin = await userDataColl.findOne({
      _id: new ObjectId(userData._id),
    });
    if (isReallyAdmin.role !== "admin") {
      return res.status(403).send({ message: "Forbidden" });
    }

    const result = await equipmentsSubmissionColl.updateOne(
      { _id: new ObjectId(equepmentId) },
      {
        $set: fieldsToUpdate,
      },
    );
    if (result) {
      return res.send(result);
    } else {
      return res.send({ status: false, message: "something went wrong" });
    }
  }
  //* if user is owner --->
  const equepmentData = await equipmentsSubmissionColl.findOne({
    _id: new ObjectId(equepmentId),
  });

  if (!equepmentData) {
    return res.send({ status: false, message: "No data found" });
  }
  if (!equepmentData.creatorId.equals(userData._id)) {
    return res.status(403).send({ message: "Forbidden" });
  }
  const result = await equipmentsSubmissionColl.updateOne(
    { _id: new ObjectId(equepmentId) },
    {
      $set: fieldsToUpdate,
    },
  );
  if (result) {
    return res.send(result);
  } else {
    return res.send({ status: false, message: "something went wrong" });
  }
});

//! get all equepment details (only auth user can see it) ----------------

app.get("/equipment-details/:id", verifyUser, async (req, res) => {
  const equipmentId = req.params.id;
  const result = await equipmentsSubmissionColl.findOne({
    _id: new ObjectId(equipmentId),
  });
  if (result) {
    res.send(result);
  } else {
    res.send({ status: false, message: "No data found" });
  }
});

//! get all user data for verified users ------------
app.get("/get-user-data/:id", verifyUser, async (req, res) => {
  const creatorId = req.params.id;
  const userData = await userDataColl.findOne({
    _id: new ObjectId(creatorId),
  });
  if (!userData) {
    return res.send({ status: false, message: "No data found" });
  }
  const userDataFiltered = {
    name: userData.name,
    email: userData.email,
    account_type: userData.account_type,
    business_address: userData.business_address,
    tel_no: userData.tel_no,
    user_image: userData.user_image,
  };
  res.send(userDataFiltered);
});

//! access all equipment list with filter (admin only)

app.get("/all-equipment-application", verifyUser, async (req, res) => {
  const userData = req.user;
  if (userData.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const result = await equipmentsSubmissionColl.find().toArray();
  if (result) {
    res.send(result);
  } else {
    res.send({ status: false, message: "No data found" });
  }
});

//! access all equipment list with approve status (public api with projection)

app.get("/all-application-public", async (req, res) => {
  try {
    const {
      category,
      rental_type,
      price_range,
      availability,
      sort_by,
      search,
    } = req.query;

    // 1. Filtering
    const query = {
      status: "approve",
    };

    if (search) {
      query.$or = [
        { equipmentName: { $regex: search, $options: "i" } },
        { equipmentLocation: { $regex: search, $options: "i" } },
      ];
    }
    if (category && category !== "all-categories") {
      query.equipmentCategory = category;
    }

    if (rental_type && rental_type !== "all-rental-types") {
      query.rentalType = rental_type;
    }

    const pipeline = [
      { $match: query },
      {
        $addFields: {
          equipmentPrice: {
            $convert: {
              input: "$equipmentPrice",
              to: "double",
              onError: null,
              onNull: null,
            },
          },
          equipmentQuantity: {
            $convert: {
              input: "$equipmentQuantity",
              to: "double",
              onError: 0,
              onNull: 0,
            },
          },
        },
      },
    ];

    if (price_range && price_range !== "all-prices") {
      const [from, to] = price_range.split("-").map(Number);

      pipeline.push({
        $match: {
          equipmentPrice: {
            $gte: from,
            $lte: to,
          },
        },
      });
    }

    if (availability === "available") {
      pipeline.push({
        $match: {
          equipmentQuantity: { $gt: 0 },
        },
      });
    }

    if (availability === "unavailable") {
      pipeline.push({
        $match: {
          equipmentQuantity: { $eq: 0 },
        },
      });
    }

    const sortOptions = {
      "recently-added": { creationDate: -1 },
      "oldest-first": { creationDate: 1 },
      "price-low-to-high": { equipmentPrice: 1 },
      "price-high-to-low": { equipmentPrice: -1 },
    };

    const sortQuery = sortOptions[sort_by];

    if (sortQuery) {
      pipeline.push({ $sort: sortQuery });
    }

    pipeline.push({
      $project: {
        equipmentName: 1,
        equipmentCategory: 1,
        equipmentPrice: 1,
        rentalType: 1,
        equipmentLocation: 1,
        equipmentQuantity: 1,
        equipmentImage: 1,
        creationDate: 1,
      },
    });

    const result = await equipmentsSubmissionColl.aggregate(pipeline).toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch equipment",
    });
  }
});

//! delete rental equipment data (admin)
app.delete("/delete/equipment/:id", verifyUser, async (req, res) => {
  const deleteRequestItemId = req.params.id;
  const apiRequester = req.user;
  if (apiRequester.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const result = await equipmentsSubmissionColl.deleteOne({
    _id: new ObjectId(deleteRequestItemId),
  });
  if (result.acknowledged) {
    res.send(result);
  } else {
    res.send({ status: false, message: "something went wrong" });
  }
});

//! approve or reject rental equipment (admin)
const actions = ["approve", "reject"];
app.patch("/application-action/:action/:id", verifyUser, async (req, res) => {
  const action = req.params.action;
  if (!actions.includes(action)) {
    return res.status(400).send({ message: "Bad request" });
  }
  const modificationId = req.params.id;
  const userData = req.user;
  if (userData.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const result = await equipmentsSubmissionColl.updateOne(
    { _id: new ObjectId(modificationId) },
    {
      $set: {
        status: action,
      },
    },
  );
  if (result.acknowledged) {
    res.send(result);
  } else {
    res.send({ status: false, message: "something went wrong" });
  }
});
//! PAYMENT SECTION ----------------------------------------------
app.post("/payment", verifyUser, async (req, res) => {
  const formData = req.body;
  const requestId = req.user;
  const equipmentData = await equipmentsSubmissionColl.findOne({
    _id: new ObjectId(formData.equipmentId),
  });
  if (formData.rentalStartDate > formData.rentalEndDate) {
    return res.send({ status: false, message: "something went wrong" });
  }
  const total =
    Number(equipmentData.equipmentPrice) *
    Number(formData.requiredQuantity) *
    Number(formData.rentalDays);
  const payload = {
    ...formData,
    equepmentOwnerId: equipmentData.creatorId,
    payment: "pending",
    paymentRequestId: requestId._id.toString(),
    paymentRequestName: requestId.name,
    paymentRequestEmail: requestId.email,
    equipmentPrice: equipmentData.equipmentPrice,
    total,
  };
  if (requestId.role !== "renter") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const result = await paymentRecord.insertOne(payload);
  if (!result) {
    return res.send({ status: false, message: "something went wrong" });
  }

  const clientUrl = process.env.CLIENT_BASE_URL;
  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          unit_amount: Number(equipmentData.equipmentPrice) * 100,
          currency: "usd",
          product_data: {
            name: String(formData.productName),
          },
        },
        quantity: Number(formData.requiredQuantity),
      },
    ],
    mode: "payment",
    success_url: `${clientUrl}/payment/success?bookingId=${result.insertedId.toString()}`,
    cancel_url: `${clientUrl}/payment/cancel?bookingId=${result.insertedId.toString()}`,
    metadata: {
      paymentInitiatorId: requestId._id.toString(),
      bookingProductId: formData.equipmentId.toString(),
      bookedId: result.insertedId.toString(),
      quantity: Number(formData.requiredQuantity),
    },
  });
  if (session) {
    res.send(session);
  } else {
    return res.send({ status: false, message: "something went wrong" });
  }
});

//! get payment record
app.get("/get-payment-record/:id", verifyUser, async (req, res) => {
  const userData = req.user;
  const paymentRecordId = req.params.id;
  const record = await paymentRecord.findOne({
    _id: new ObjectId(paymentRecordId),
  });
  if (record.paymentRequestId === userData._id.toString()) {
    res.send(record);
  } else {
    return res.status(403).send({ message: "Forbidden" });
  }
});

//! latest 6 approved rental equepment for featured collection ----

app.get("/latest-rental-equipments", async (req, res) => {
  const latestApprovedApplication = await equipmentsSubmissionColl
    .find(
      { status: "approve" },
      {
        projection: {
          equipmentName: 1,
          equipmentCategory: 1,
          equipmentPrice: 1,
          rentalType: 1,
          equipmentLocation: 1,
          equipmentQuantity: 1,
          equipmentImage: 1,
          creationDate: 1,
        },
      },
    )
    .sort({ creationDate: -1 })
    .limit(6)
    .toArray();
  res.send(latestApprovedApplication);
});

//! get 6 most used category
app.get("/most-used-category", async (req, res) => {});

//! update retting and comments
app.post("/get-retting", verifyUser, async (req, res) => {
  const reviewData = req.body;
  const payload = {
    ...reviewData,
    reviewDate: new Date(),
  };
  const result = await review.insertOne(payload);
  res.send(result);
});

//! get review

app.get("/user-reviews", async (req, res) => {
  const latestReviews = await review
    .find({})
    .sort({ reviewDate: -1 })
    .limit(20)
    .toArray();
  res.send(latestReviews);
});

//! delete a equepment application (provider)
app.delete("/delete-equipment/:id", verifyUser, async (req, res) => {
  const userData = req.user;
  const equipmentId = req.params.id;
  const equipmentData = await equipmentsSubmissionColl.findOne({
    _id: new ObjectId(equipmentId),
  });
  if (String(equipmentData.creatorId) === String(userData._id)) {
    const result = await equipmentsSubmissionColl.deleteOne({
      _id: new ObjectId(equipmentId),
    });
    if (result) {
      res.send(result);
    } else {
      return res.send({ status: false, message: "something went wrong" });
    }
  } else {
    return res.status(403).send({ message: "Forbidden" });
  }
});

//! get all payment record (provider)
app.get("/get-payment-record", verifyUser, async (req, res) => {
  const userData = req.user;
  const userId = userData._id;
  const result = await paymentRecord
    .find({ equepmentOwnerId: userId })
    .toArray();
  if (result) {
    res.send(result);
  } else {
    return res.send({ status: false, message: "something went wrong" });
  }
});
//! get  a specific payment record
app.get("/get-user-payment-record/:id", verifyUser, async (req, res) => {
  const userId = req.user._id;
  const recordId = req.params.id;
  const result = await paymentRecord.findOne({ _id: new ObjectId(recordId) });
  if (result) {
    if (userId.toString() !== result.equepmentOwnerId.toString()) {
      return res.status(403).send({ message: "Forbidden" });
    }
    res.send(result);
  } else {
    return res.send({ status: false, message: "something went wrong" });
  }
});

//! update profile info
app.patch("/update-profile-info", async (req, res) => {
  const { userID, ...updateInfo } = req.body;
  const result = await userDataColl.updateOne(
    { _id: new ObjectId(userID) },
    {
      $set: updateInfo,
    },
  );
  if (result) {
    res.send(result);
  } else {
    return res.status(403).send({ message: "Forbidden" });
  }
});

//! get profile info
app.get("/get-profile-info/", verifyUser, async (req, res) => {
  res.send(req.user);
});

app.get("/get-payment-history", verifyUser, async (req, res) => {
  const userID = req.user._id;
  const history = await paymentRecord
    .find({ paymentRequestId: userID.toString() })
    .toArray();
  if (history) {
    res.send(history);
  } else {
    return res.send({ status: false, message: "something went wrong" });
  }
});

app.get("/all-users", verifyUser, async (req, res) => {
  const userData = req.user;
  if (userData.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }
  const allUsers = await userDataColl.find().toArray();
  res.send(allUsers);
});

app.get("/admin-action-user/:id/:action", verifyUser, async (req, res) => {
  const userData = req.user;
  const actionId = req.params.id;
  const action = req.params.action;
  if (userData.role !== "admin") {
    return res.status(403).send({ message: "Forbidden" });
  }

  if (action === "delete") {
    const result = await userDataColl.deleteOne({
      _id: new ObjectId(actionId),
    });
    if (result) {
      res.send(result);
    } else {
      return res.send({ status: false, message: "something went wrong" });
    }
  }
  const roleBasedAction = ["admin", "renter", "provider"];
  if (roleBasedAction.includes(action)) {
    const result = await userDataColl.updateOne(
      { _id: new ObjectId(actionId) },
      {
        $set: {
          role: action,
        },
      },
    );
    console.log(result);
    if (result) {
      return res.send(result);
    } else {
      return res.send({ status: false, message: "something went wrong" });
    }
  }
  return res.status(400).send({ message: "Bad request" });
});

app.listen(port, () => {
  console.log("server is running on ", port);
});
export default app;