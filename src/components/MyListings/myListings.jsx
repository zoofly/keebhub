import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useHistory } from "react-router";
import "./MyListings.css";
import { Card, Button, TextField, Input, Grid} from "@material-ui/core";
 import swal from 'sweetalert';
function MyListings() {
  const dispatch = useDispatch();

  const [isVisible, setIsVisible] = useState(false);
  const [postTitle, setTitle] = useState("");
  const [postDescription, setDescription] = useState("");
  const [postImage, setImage] = useState("");
  const [postPrice, setPrice] = useState("");
  const [editItemId, setEditItemId] = useState("");
  const [postDetails, setPostDetails] = useState("");
  const myListings = useSelector((store) => store.myListings);
 

  useEffect(() => {
    dispatch({ type: "GET_MY_LISTINGS" });
  }, []);

  const isVisibleToggle = () => {
    setIsVisible(!isVisible);
  };


  
  const handleDelete = (deleteItem) => {
    swal({
      title: "Post Deleted!",
      text: "Post Successfully Deleted!",
      icon: "success",
      button: "Okay",
    });
    dispatch({ type: "DELETE_POST", payload: deleteItem });
  };

  const handleEdit = (postDetails) => {
    isVisibleToggle();
    setTitle(postDetails.title);
    setDescription(postDetails.description);
    setPrice(postDetails.price);
    setImage(postDetails.image);
    setEditItemId(postDetails.id);
    console.log(`The post's ID is: ${postDetails.id}`);
  };

  const handleSave = () => {
    dispatch({
      type: "EDIT_ITEM",
      payload: {
        title: postTitle,
        description: postDescription,
        price: postPrice,
        image: postImage,
        id: editItemId,
      },
    });
    isVisibleToggle();
    swal({
      title: "Updated Post!",
      icon: "success",
      button: "Okay",
    });
  };

  return (
    <div className="myPostContainer">
      <h2 id="myHeading">Your Posts ({myListings.length}) </h2>

      {myListings.map((post) => {
        return (
          <Card id="indPost" key={post.id}>
            <h3 className="myPostTitles"> {post.title} </h3>
            <p className="myPostPrice"> ${post.price} </p>
            <center>
            <img src={post.image} />
            </center>
            <p className="myPostDescription"> {post.description} </p>
            <div className="editBtns">
              <Button
                variant="contained"
                color="secondary"
                id="deleteBtn"
                onClick={() => handleDelete(post.id)}
              >
                Delete
              </Button>
              <Button
                variant="contained"
                color="primary"
                id="editBtn"
                onClick={() => handleEdit(post)}
              >
                Edit
              </Button>
            </div>
          </Card>
        );
      })}

      {isVisible && (
        <Card id="editForm">
          <h1 id='EditFormHeader'> Edit Post </h1>
          <form id="editFields">
          <Grid container direction={'column'} spacing={1}>
            <TextField
              className="InputFields"
              label="Title"
              type="text"
              value={postTitle}
              onChange={(event) => setTitle(event.target.value)}
            />
            <br />
            <TextField
              className="InputFields"
              label="Description"
              multiline
              maxrows={5}
              type="text"
              value={postDescription}
              onChange={(event) => setDescription(event.target.value)}
            />
            <br />
            <TextField
              className="InputFields"
              label="Image URL"
              type="text"
              value={postImage}
              onChange={(event) => setImage(event.target.value)}
            />
            <br />
            <TextField
              className="InputFields"
              label="Price"
              type="number"
              value={postPrice}
              onChange={(event) => setPrice(event.target.value)}
            />
            <br />
            </Grid>
          </form>
          <Button
            id="saveBtn"
            variant="contained"
            color="primary"
            size="small"
            id="saveBtn"
            type="button"
            onClick={() => handleSave()}
          >
            Save Changes
          </Button>
        </Card>
      )}
    </div>
  );
}
export default MyListings;
