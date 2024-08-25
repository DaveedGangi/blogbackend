
const express =require("express");

const app = express();

app.use(express.json());

const cors = require("cors");

app.use(cors());

const path = require("path");

const bcrypt = require("bcrypt");
const jwt=require("jsonwebtoken");

const {open} = require("sqlite");
const sqlite3 = require("sqlite3");

const dbPath = path.join(__dirname, "posts.db");

let db;

const initializeDbAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    
    // create table for user 
    await db.run(
      `CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT,
        password TEXT
      )`
    );

    // create table for posts
    await db.run(
      `CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT,
        description TEXT,
        image TEXT,
        datetime TEXT,
        commentshow INTEGER DEFAULT 0,
        user_id INTEGER,
        username TEXT,
        FOREIGN KEY(username) REFERENCES users (username),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )`
    );

    // create table for comments
    await db.run(
      `CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER,
        content TEXT,
        datetime TEXT,
        user_id INTEGER,
        username TEXT,
        FOREIGN KEY(username) REFERENCES users (username),
        FOREIGN KEY(post_id) REFERENCES posts(id),
        FOREIGN KEY(user_id) REFERENCES users(id)
      )`
    );
    

    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const verifyToken = (request, response, next) => {
    const token = request.headers.authorization?.split(" ")[1];
    console.log("Verifying token:", token);
    if (token === undefined) {
      response.status(401).send({ errorMessage: "Token is required" });
      return;
    }
    jwt.verify(token, "MY_SECRET_TOKEN", (err, data) => {
      if (err) {
        response.status(403).send({ errorMessage: "Invalid token" });
        return;
      }
      request.userId = data.id;
      next();
    });
  };






// user register
app.post("/register", async (request, response) => {
    const { username, password } = request.body;
    console.log(username, password);
    const hashedPassword = await bcrypt.hash(password, 10);
    const selectUserQuery = `SELECT * FROM users WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
  const createUserQuery = `
       INSERT INTO
        users (username, password)
       VALUES
        (
         '${username}',
         '${hashedPassword}'
        );`;
      await db.run(createUserQuery);
      response.send({errorMessage:"User created successfully"});
    }
    else {
          
      response.send({errorMessage:"User already exists"});
    }
    });
  
  
// user login
  app.post("/login",async (request, response) => {
    const { username, password } = request.body;
    const selectUserQuery = `SELECT * FROM users WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
      response.status(400);
      response.send({errorMessage:"Invalid user"});
    } else {
      const isPasswordMatched = await bcrypt.compare(password, dbUser.password);
      if (isPasswordMatched === true) {
          const payload = {
            username: username,
            id:dbUser.id
          };
  
        const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
        response.send({jwtToken:jwtToken,username:dbUser.username,id:dbUser.id});
      } else {
        response.status(400);
        response.send({errorMessage:"Invalid password"});
      }
    }
  });
  
  
// create a new posts 
  
  app.post("/posts",verifyToken, async (request, response) => {
    const { title, description, image} = request.body;
    const getUserQuery=`SELECT username FROM users WHERE id=${request.userId}`;
    const user=await db.get(getUserQuery);

    const datetime = new Date().toISOString();

    const createPostQuery = `
       INSERT INTO
        posts (title, description, image, datetime,user_id,username)
       VALUES
        (
         '${title}',
         '${description}',
         '${image}',
         '${datetime}',
          ${request.userId},
          '${user.username}'
        );`;
      await db.run(createPostQuery);
      response.send({message:"Post created successfully"});
    });

// get all posts
  app.get("/posts",verifyToken, async (request, response) => {
    const getAllPostsQuery = `SELECT * FROM posts ORDER BY datetime DESC`;
    const allPosts = await db.all(getAllPostsQuery);
    response.send(allPosts);
  });

// update a post
  app.put("/posts/:id",verifyToken, async (request, response) => {
    const { title, description, image } = request.body;
    const { id } = request.params;
    const updatePostQuery = `
       UPDATE
        posts
       SET
        title = '${title}',
        description = '${description}',
        image = '${image}'
       WHERE
        id = ${id};`;
      await db.run(updatePostQuery);
      response.send({message:"Post updated successfully"});
    });

// delete a post
  app.delete("/posts/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const deletePostQuery = `DELETE FROM posts WHERE id = ${id}`;
    await db.run(deletePostQuery);
    response.send({message:"Post deleted successfully"});
  });

  // get a single post
  app.get("/posts/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const getPostQuery = `SELECT * FROM posts WHERE id = ${id}`;
    const post = await db.get(getPostQuery);
    if (post === undefined) {
      response.status(404);
      response.send({errorMessage:"Post not found"});
    } else {
      response.send(post);
    }
  });

  // add comment to a post
  app.post("/addcomment/:id",verifyToken, async (request, response) => {
    const { content } = request.body;

    const getUserQuery=`SELECT username FROM users WHERE id=${request.userId}`;
    const user=await db.get(getUserQuery);
    
    const { id } = request.params;
    const datetime = new Date().toISOString();
    const addCommentQuery = `
       INSERT INTO
        comments (post_id, content, datetime,user_id,username)
       VALUES
        (
         ${id},
         '${content}',
         '${datetime}',
         ${request.userId},
         '${user.username}'
        );`;
      await db.run(addCommentQuery);
      response.send({message:"Comment added successfully"});
    });

  // get comments of a post
  app.get("/getcomments/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const getCommentsQuery = `SELECT * FROM comments WHERE post_id = ${id}`;
    const comments = await db.all(getCommentsQuery);
    response.send(comments);
  });

  // update comment show status
  app.put("/updatecommentshow/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const updateCommentShowQuery = `
       UPDATE
        comments
       SET
        commentshow = 1
       WHERE
        id = ${id};`;
      await db.run(updateCommentShowQuery);
      response.send({message:"Comment show status updated successfully"});
    });

// delete comment 
  
  app.delete("/deletecomment/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const deleteCommentQuery = `DELETE FROM comments WHERE id = ${id}`;
    await db.run(deleteCommentQuery);
    response.send({message:"Comment deleted successfully"});
  });

  // get the posts based on user_id
  app.get("/getmyposts",verifyToken, async (request, response) => {
    const getPostsQuery = `SELECT * FROM posts WHERE user_id = ${request.userId}`;
    const posts = await db.all(getPostsQuery);
    response.send(posts);
  });


  // showing comment on posts 
  
  app.put("/showcomments/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const updateCommentShowQuery = `
       UPDATE
        posts
       SET
        commentshow = 1
       WHERE
        id = ${id};`;
      await db.run(updateCommentShowQuery);
      response.send({message:"Comment show status updated successfully"});
    });


  // hide comment on posts
  app.put("/hidecomments/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const updateCommentShowQuery = `
       UPDATE
        posts
       SET
        commentshow = 0
       WHERE
        id = ${id};`;
      await db.run(updateCommentShowQuery);
      response.send({message:"Comment show status updated successfully"});
    });



// get the usename based on use id 
  
  app.get("/getusername/:id",verifyToken, async (request, response) => {
    const { id } = request.params;
    const getUsernameQuery = `SELECT username FROM users WHERE id = ${id}`;
    const username = await db.get(getUsernameQuery);
    response.send(username);
  });