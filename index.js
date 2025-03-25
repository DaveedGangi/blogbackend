require("dotenv").config();


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

const SECRET_KEY = process.env.JWT_SECRET;
const PORT = process.env.PORT || 3000 ; 

if(!SECRET_KEY){
    console.error("JWT_SECRET is not defined");
    process.exit(1);
}


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
        username TEXT UNIQUE,
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
        FOREIGN KEY(post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY(user_id) REFERENCES users(id)
      )`
    );
    

    app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDbAndServer();

const verifyToken = (request, response, next) => {
    
    const authHeaders= request.headers.authorization;
   
    if (!authHeaders) {
      response.status(401).send({ errorMessage: "Token is required" });
      return;
    }
    const token = authHeaders.split(" ")[1];
    console.log("Verifying token:", token);
    jwt.verify(token, SECRET_KEY, (err, data) => {
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
    const selectUserQuery = `SELECT * FROM users WHERE username =?`;

    
    const dbUser = await db.get(selectUserQuery,[username]);
   
      const createUserQuery = `
       INSERT INTO
        users (username, password)
       VALUES
        (?,?);`;

  try{
      await db.run(createUserQuery,[username,hashedPassword]);
      response.send({errorMessage:"User created successfully"});
      }
  catch(e){
    
    response.status(400).send({ errorMessage: "User already exists" });
    }




    });
  
  
// user login
  app.post("/login",async (request, response) => {
    const { username, password } = request.body;
    console.log(username, password);

    try{
    const selectUserQuery = `SELECT * FROM users WHERE username =?`;
    const dbUser = await db.get(selectUserQuery,[username]);
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
  
        const jwtToken = jwt.sign(payload, SECRET_KEY);
        response.send({jwtToken:jwtToken,username:dbUser.username,id:dbUser.id});
      } else {
        response.status(400);
        response.send({errorMessage:"Invalid password"});
      }
    }
  }
  catch(e){
    response.status(400).send({ errorMessage: "Invalid user" });
  }


  });
  
  
// create a new posts 
  
  app.post("/posts",verifyToken, async (request, response) => {

    try{
    const { title, description, image} = request.body;
    const getUserQuery=`SELECT username FROM users WHERE id=?`;

    const user=await db.get(getUserQuery,[request.userId]);

    const datetime = new Date().toISOString();

    const createPostQuery = `
       INSERT INTO
        posts (title, description, image, datetime,user_id,username)
       VALUES
        (?,?,?,?,?,? );`;
      await db.run(createPostQuery,[title, description, image, datetime,request.userId,user.username]);
      response.send({message:"Post created successfully"});

    }
    catch(e){
      response.status(400).send({ errorMessage: "Error creating post" });
    }
    });

// get all posts
  app.get("/posts",verifyToken, async (request, response) => {

    try{
    const getAllPostsQuery = `SELECT * FROM posts ORDER BY datetime DESC`;
    const allPosts = await db.all(getAllPostsQuery);
    response.send(allPosts);
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error getting posts" });
    }
  });

// update a post
  app.put("/posts/:id",verifyToken, async (request, response) => {
    try{
    const { title, description, image } = request.body;
    const { id } = request.params;
    const postOwnerQuery = `SELECT user_id FROM posts WHERE id = ?`;
    const post = await db.get(postOwnerQuery, [id]);
    if (!post || post.user_id !== request.userId) {
        return response.status(403).send({ errorMessage: "Unauthorized action" });
    }
    else{

    const updatePostQuery = `
       UPDATE
        posts
       SET
        title =?,
        description = ?,
        image = ?
       WHERE
        id = ?`;
      await db.run(updatePostQuery,[title,description,image,id]);
      response.send({message:"Post updated successfully"});
    }
  }
  catch(e){
      response.status(400).send({ errorMessage: "Error updating post" });
    }


    });

// delete a post
  app.delete("/posts/:id",verifyToken, async (request, response) => {

    try{
    const { id } = request.params;

    const postOwnerQuery = `SELECT user_id FROM posts WHERE id = ?`;
    const post = await db.get(postOwnerQuery, [id]);
   
    if(!post || post.user_id !==request.userId){
      response.status(401).send({errorMessage:"Unauthorized to delete this post"});
      return;
    }
    else{
      const deletePostQuery = `DELETE FROM posts WHERE id = ?`;
      await db.run(deletePostQuery,[id]);
      response.send({message:"Post deleted successfully"});
    }

  }
  catch(e){
      response.status(400).send({ errorMessage: "Error deleting post" });
    }

   
  });

  // get a single post
  app.get("/posts/:id",verifyToken, async (request, response) => {
    try{
    const { id } = request.params;
    const getPostQuery = `SELECT * FROM posts WHERE id =?`;
    const post = await db.get(getPostQuery,[id]);
    if (post === undefined) {
      response.status(404);
      response.send({errorMessage:"Post not found"});
    } else {
      response.send(post);
    }

  }
  catch(e){
      response.status(400).send({ errorMessage: "Error getting post" });
    }


  });

  // add comment to a post
  app.post("/addcomment/:id",verifyToken, async (request, response) => {

    try{
    const { content } = request.body;

    const getUserQuery=`SELECT username FROM users WHERE id=?`;
    const user=await db.get(getUserQuery,[request.userId]);
    
    const { id } = request.params;
    const datetime = new Date().toISOString();
    const addCommentQuery = `
       INSERT INTO
        comments (post_id, content, datetime,user_id,username)
       VALUES
        (?,?,?,?,?);`;
      await db.run(addCommentQuery,[id,content,datetime,request.userId,user.username]);
      response.send({message:"Comment added successfully"});
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error adding comment" });
    }


    });

  // get comments of a post
  app.get("/getcomments/:id",verifyToken, async (request, response) => {
    try{
    const { id } = request.params;
    const getCommentsQuery = `SELECT * FROM comments WHERE post_id =?`;
    const comments = await db.all(getCommentsQuery,[id]);
    response.send(comments);
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error getting comments" });
    }


  });

  // update comment show status
  app.put("/updatecommentshow/:id",verifyToken, async (request, response) => {
    try{
    const { id } = request.params;
    const updateCommentShowQuery = `
       UPDATE
        comments
       SET
        commentshow = 1
       WHERE
        id = ?`;
      await db.run(updateCommentShowQuery,[id]);
      response.send({message:"Comment show status updated successfully"});
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error updating comment show status" });
    }


    });

// delete comment 
  
  app.delete("/deletecomment/:id",verifyToken, async (request, response) => {
    try{
    const { id } = request.params;
    const deleteCommentQuery = `DELETE FROM comments WHERE id = ?`;
    await db.run(deleteCommentQuery,[id]);
    response.send({message:"Comment deleted successfully"});
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error deleting comment" });
    }


  });

  // get the posts based on user_id
  app.get("/getmyposts",verifyToken, async (request, response) => {
    try{
    const getPostsQuery = `SELECT * FROM posts WHERE user_id =?`;
    const posts = await db.all(getPostsQuery,[request.userId]);
    response.send(posts);
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error getting posts" });
    }


  });


  // showing comment on posts 
  
  app.put("/showcomments/:id",verifyToken, async (request, response) => {
    try{
    const { id } = request.params;
    const updateCommentShowQuery = `
       UPDATE
        posts
       SET
        commentshow = 1
       WHERE
        id =?`;
      await db.run(updateCommentShowQuery,[id]);
      response.send({message:"Comment show status updated successfully"});
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error updating comment show status" });
    }


    });


  // hide comment on posts
  app.put("/hidecomments/:id",verifyToken, async (request, response) => {
    try{
    const { id } = request.params;
    const updateCommentShowQuery = `
       UPDATE
        posts
       SET
        commentshow = 0
       WHERE
        id = ?`;
      await db.run(updateCommentShowQuery,[id]);
      response.send({message:"Comment hide status updated successfully"});
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error updating comment hide status" });
    }


    });



// get the usename based on use id 
  
  app.get("/getusername/:id",verifyToken, async (request, response) => {
    try{
    const { id } = request.params;
    const getUsernameQuery = `SELECT username FROM users WHERE id = ?`;
    const username = await db.get(getUsernameQuery,[id]);
    response.send(username);
    }
    catch(e){
      response.status(400).send({ errorMessage: "Error getting username" });
    }

    
  });