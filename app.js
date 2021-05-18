const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const middleware = express.json();
app.use(middleware);

let db = null;
const dbPath = path.join(__dirname, "twitterClone.db");

const initialiseDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (error) {
    console.log(`DB Error: ${error.message}`);
  }
};

initialiseDbAndServer();

const authenticateToken = async (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    jwtToken = authHeader.split(" ")[1];
    jwt.verify(jwtToken, "kijdhrhfbsajhabhj", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const convertDbObjectToResponseObject = (dbObject) => {
  return {
    name: dbObject.name,
    username: dbObject.username,
    tweet: dbObject.tweet,
    tweet: dbObject.tweet,
    likes: dbObject.likes,
    replies: dbObject.replies,
    dateTime: dbObject.date_time,
  };
};

const convertToListOfUsernames = (usernameDetails) => {
  let listOfUsernames = [];
  for (let username of usernameDetails) {
    listOfUsernames.push(username.username);
  }
  return { likes: listOfUsernames };
};

const convertToListOfReplies = (replyDetails) => {
  let listOfReplies = [];
  for (let reply of replyDetails) {
    listOfReplies.push({
      name: reply.name,
      reply: reply.reply,
    });
  }
  return { replies: listOfReplies };
};

const getUserId = async (username) => {
  console.log(username);
  const getUserDetailsQuery = `
    SELECT
        *
    FROM
        user
    WHERE username = "${username}";
  `;
  const getUserDetails = await db.get(getUserDetailsQuery);
  const user_id = getUserDetails.user_id;
  console.log(user_id);
  return user_id;
};

//API1: To register a new user account
app.post("/register/", async (request, response) => {
  const { name, username, password, gender } = request.body;
  const isUserAlreadyExistsQuery = `
    SELECT
        *
    FROM
        user
    WHERE
        username = "${username}";
  `;
  const isUserAlreadyExists = await db.get(isUserAlreadyExistsQuery);
  if (isUserAlreadyExists === undefined) {
    const hashedPassword = await bcrypt.hash(password, 10);
    if (password.length >= 6) {
      const createUserAccountQuery = `
        INSERT INTO user(name,username,password,gender)
        VALUES ("${name}","${username}","${hashedPassword}","${gender}");
        `;
      const createUserAccount = await db.run(createUserAccountQuery);
      response.send("User created successfully");
    } else {
      response.status(400);
      response.send("Password is too short");
    }
  } else {
    response.status(400);
    response.send("User already exists");
  }
});

//API2: To login user account
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const isUserValidQuery = `
    SELECT
        *
    FROM
        user
    WHERE
        username = "${username}";
  `;
  const isUserValid = await db.get(isUserValidQuery);
  if (isUserValid === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    const isPasswordMatched = await bcrypt.compare(
      password,
      isUserValid.password
    );
    if (isPasswordMatched === true) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "kijdhrhfbsajhabhj");
      response.send({ jwtToken });
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//API3: To return the latest 4 tweets of people whom the user follows
app.get("/user/tweets/feed/", authenticateToken, async (request, response) => {
  const { username } = request;
  const user_id = getUserId(username);
  console.log(user_id);
  const getTweetsOfPeopleFollowingQuery = `
    SELECT
        user.username,
        tweet.tweet,
        tweet.date_time
    FROM
        (follower
        INNER JOIN
        tweet
        ON
        following_user_id = user_id) AS tweetsOfFollowing
        INNER JOIN user
        ON tweetsOfFollowing.following_user_id = user.user_id
    WHERE
        follower.follower_user_id = ${user_id}
    ORDER BY tweet.date_time DESC
    LIMIT 4;
  `;
  const getTweetsOfPeopleFollowing = await db.all(
    getTweetsOfPeopleFollowingQuery
  );
  response.send(
    getTweetsOfPeopleFollowing.map((eachObject) =>
      convertDbObjectToResponseObject(eachObject)
    )
  );
});

module.exports = app;
