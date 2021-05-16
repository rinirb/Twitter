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
  const getUserDetailsQuery = `
    SELECT
        *
    FROM
        user
    WHERE username = "${username}";
  `;
  const getUserDetails = await db.get(getUserDetailsQuery);
  const user_id = getUserDetails.user_id;
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

//API4: To return the list of all names of people whom the user follows
app.get("/user/following/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
  const getUserDetails = await db.get(getUserDetailsQuery);
  const user_id = getUserDetails.user_id;

  const getFollowingPeopleListQuery = `
        SELECT
            user.name
        FROM
            follower
            INNER JOIN
            user
            ON
            follower.following_user_id = user.user_id
        WHERE
            follower_user_id = ${user_id};
    `;
  const getFollowingPeopleList = await db.all(getFollowingPeopleListQuery);
  response.send(
    getFollowingPeopleList.map((eachObject) =>
      convertDbObjectToResponseObject(eachObject)
    )
  );
});

//API5: To return the list of all names of people who follows the user
app.get("/user/followers/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
  const getUserDetails = await db.get(getUserDetailsQuery);
  const user_id = getUserDetails.user_id;
  const getFollowingPeopleListQuery = `
        SELECT
            user.name
        FROM
            follower
            INNER JOIN
            user
            ON
            follower.follower_user_id = user.user_id
        WHERE
            following_user_id = ${user_id};
    `;
  const getFollowingPeopleList = await db.all(getFollowingPeopleListQuery);
  response.send(
    getFollowingPeopleList.map((eachObject) =>
      convertDbObjectToResponseObject(eachObject)
    )
  );
});

//API6: To return the tweet, likes count, replies count and date-time of a tweet of the user he is following
app.get("/tweets/:tweetId/", authenticateToken, async (request, response) => {
  const { tweetId } = request.params;
  const { username } = request;
  const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
  const getUserDetails = await db.get(getUserDetailsQuery);
  const user_id = getUserDetails.user_id;
  const getTweetDetailsQuery = `
    SELECT
        tweet.tweet,
        COUNT (DISTINCT like.like_id) AS likes,
        COUNT (DISTINCT reply.reply_id) AS replies,
        tweet.date_time
    FROM
        tweet INNER JOIN like 
        ON tweet.tweet_id = like.tweet_id
        INNER JOIN reply
        ON tweet.tweet_id = reply.tweet_id
    WHERE
        tweet.tweet_id IN(
            SELECT
                DISTINCT tweet.tweet_id
            FROM
                (follower
                INNER JOIN tweet
                ON follower.following_user_id = tweet.user_id) AS tweet_details
                INNER JOIN like
                ON tweet_details.tweet_id = like.tweet_id
            WHERE
                follower_user_id = ${user_id}
    )
    AND tweet.tweet_id = ${tweetId}
    GROUP BY tweet.tweet_id;
  `;
  const getTweetDetails = await db.get(getTweetDetailsQuery);
  if (getTweetDetails === undefined) {
    response.status(401);
    response.send("Invalid Request");
  } else {
    response.send(convertDbObjectToResponseObject(getTweetDetails));
  }
});

//API7: To return the list of usernames who liked the tweet of a user he is following
app.get(
  "/tweets/:tweetId/likes/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
    const getUserDetails = await db.get(getUserDetailsQuery);
    const user_id = getUserDetails.user_id;
    const getUsernameDetailsQuery = `
    SELECT
        user.username
    FROM
        like INNER JOIN user 
        ON like.user_id = user.user_id
        INNER JOIN tweet
        ON tweet.tweet_id = like.tweet_id
    WHERE
        tweet.tweet_id IN(
            SELECT
                DISTINCT tweet.tweet_id
            FROM
                (follower
                INNER JOIN tweet
                ON follower.following_user_id = tweet.user_id) AS tweet_details
            WHERE
                follower_user_id = ${user_id}
    )
    AND tweet.tweet_id = ${tweetId};
  `;
    const getUsernameDetails = await db.all(getUsernameDetailsQuery);
    const listOfUsernames = convertToListOfUsernames(getUsernameDetails);
    const numberOfLikes = getUsernameDetails.length;
    if (numberOfLikes >= 1) {
      response.send(listOfUsernames);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API8: To return the list of replies of a tweet of a user he is following
app.get(
  "/tweets/:tweetId/replies/",
  authenticateToken,
  async (request, response) => {
    const { tweetId } = request.params;
    const { username } = request;
    const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
    const getUserDetails = await db.get(getUserDetailsQuery);
    const user_id = getUserDetails.user_id;
    const getReplyDetailsQuery = `
    SELECT
        user.name,
        reply.reply
    FROM
        reply INNER JOIN user 
        ON reply.user_id = user.user_id
        INNER JOIN tweet
        ON tweet.tweet_id = reply.tweet_id
    WHERE
        tweet.tweet_id IN(
            SELECT
                DISTINCT tweet.tweet_id
            FROM
                (follower
                INNER JOIN tweet
                ON follower.following_user_id = tweet.user_id) AS tweet_details
            WHERE
                follower_user_id = ${user_id}
    )
    AND tweet.tweet_id = ${tweetId};
  `;
    const getReplyDetails = await db.all(getReplyDetailsQuery);

    const listOfReplies = convertToListOfReplies(getReplyDetails);
    const numberOfReplies = getReplyDetails.length;
    if (numberOfReplies >= 1) {
      response.send(listOfReplies);
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

//API9: To return a list of all tweets of the user
app.get("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
  const getUserDetails = await db.get(getUserDetailsQuery);
  const user_id = getUserDetails.user_id;

  const getTweetDetailsQuery = `
    SELECT
        tweet.tweet,
        COUNT (DISTINCT like.like_id) AS likes,
        COUNT (DISTINCT reply.reply_id) AS replies,
        tweet.date_time
    FROM
        user INNER JOIN tweet 
        ON user.user_id = tweet.user_id
        INNER JOIN like 
        ON tweet.tweet_id = like.tweet_id
        INNER JOIN reply
        ON tweet.tweet_id = reply.tweet_id
    WHERE
        user.user_id = ${user_id}
    GROUP BY tweet.tweet_id;
  `;
  const getTweetDetails = await db.all(getTweetDetailsQuery);
  response.send(
    getTweetDetails.map((eachObject) =>
      convertDbObjectToResponseObject(eachObject)
    )
  );
});

//API10: To create a tweet in the tweet table
app.post("/user/tweets/", authenticateToken, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
  const getUserDetails = await db.get(getUserDetailsQuery);
  const user_id = getUserDetails.user_id;
  const date_time = new Date();
  const createTweetQuery = `
        INSERT INTO tweet(tweet,user_id,date_time)
        VALUES("${tweet}",${user_id},"${date_time}");
  `;
  await db.run(createTweetQuery);
  response.send("Created a Tweet");
});

//API11: To delete the tweet of current user
app.delete(
  "/tweets/:tweetId/",
  authenticateToken,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const getUserDetailsQuery = `
            SELECT
                *
            FROM
                user
            WHERE username = "${username}";
        `;
    const getUserDetails = await db.get(getUserDetailsQuery);
    const user_id = getUserDetails.user_id;

    const isUserTweetQuery = `
        SELECT
            *
        FROM
            tweet
        WHERE
            tweet.user_id = ${user_id}
            AND tweet.tweet_id = ${tweetId};
    `;
    const isUserTweet = await db.get(isUserTweetQuery);
    console.log(isUserTweet);
    if (isUserTweet !== undefined) {
      const deleteTweetDetailsQuery = `
            DELETE FROM tweet
            WHERE 
            tweet.tweet_id IN(
                    SELECT
                        DISTINCT tweet.tweet_id
                    FROM
                        tweet
                    WHERE
                        tweet.user_id = ${user_id}
            )
            AND tweet.tweet_id = ${tweetId};
        `;
      await db.run(deleteTweetDetailsQuery);
      response.send("Tweet Removed");
    } else {
      response.status(401);
      response.send("Invalid Request");
    }
  }
);

module.exports = app;
