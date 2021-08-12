import "./PostingsList.css";
import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { Container, Card } from "@material-ui/core";

function PostingsList() {
  const dispatch = useDispatch();
  const postings = useSelector((store) => store.postings);
  const [favorite, setFavorite] = useState(false);

  useEffect(() => {
    dispatch({ type: "GET_LISTINGS" });
  }, []);

  return (
    <Container className="PostContainer">
      {postings.map((post) => {
        return (
          <Card id="indPost" key={post.id}>
            <h2 id='postTitle'> {post.title}</h2>
            <h3 id='postPrice'> ${post.price} </h3>
            <center>
              <img src={post.image} width="200px" height="200px" />
            </center>
            <p id="postDescription"> {post.description} </p>
          </Card>
        );
      })}
    </Container>
  );
}

export default PostingsList;
