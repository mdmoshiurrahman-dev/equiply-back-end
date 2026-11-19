import express from "express";
import cors from "cors";
import 'dotenv/config'


const app = express();
const port = "5000";
app.use(cors());
app.use(express.json());
app.get("/", (req, res) => {
  res.send({ message: "server is running" });
});
app.listen(port, () => {
  console.log("server is running on ", port);
});
