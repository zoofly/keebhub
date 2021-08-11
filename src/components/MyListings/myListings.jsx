import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import './MyListings.css';

function MyListings() {
    const dispatch = useDispatch();

    const [isVisible, setIsVisible] = useState(false);
    const [postTitle, setTitle]= useState('');
    const [postDescription, setDescription]= useState('');
    const [postImage, setImage]= useState('');
    const [postPrice, setPrice]= useState('');
    const [editItemId, setEditItemId] = useState('');
    const [postDetails, setPostDetails] = useState ('');
    const myListings = useSelector(store => store.myListings);
    

    useEffect(() => {
        dispatch({ type: 'GET_MY_LISTINGS' });
    }, []);
      
    const isVisibleToggle = () => {
      setIsVisible(!isVisible);
    };
  
      const handleDelete = (deleteItem) => {
        dispatch({ type: 'DELETE_POST', payload: deleteItem })
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
        dispatch({ type: 'EDIT_ITEM', payload: {
          title: postTitle,
          description: postDescription, 
          price: postPrice,
          image: postImage,
          id: editItemId
        } })
        isVisibleToggle();
        
      };
    
        return (
            <div className="container">
              <h2>Your Posts</h2>
             
              {myListings.map(post => {
                return (
                  <div className='indPost'key= {post.id}>
                    <h3> {post.title} </h3>
                    <p> {post.description} </p>
                    <p> ${post.price} </p>
                    <img src={post.image} />
                   
                  </div>
                  
                );
              })}
              
                    { isVisible ?
                    <div id='editForm'>
                    <label> Title: </label>
                    <input type="text" value={postDetails.postTitle} onChange={(event) => setTitle(event.target.value)} />
                    <label> Description: </label>
                    <textarea type="text" value={postDescription} onChange={(event) => setDescription(event.target.value)} />
                    <label> Upload Image </label>
                    <input type="text" value={postImage} onChange={(event) => setImage(event.target.value)} />
                    <label> Price: </label>
                    <input type="number" value={postPrice} onChange={(event) => setPrice(event.target.value)} />
                    <button id= 'saveBtn' type="button" onClick={ () => handleSave()}>Save Changes</button>
                    </div> :
                      <div className= 'editBtns'>
                      <button id='deleteBtn' onClick={ () => handleDelete(post.id)}>Delete</button>
                      <button id='editBtn'  onClick={ () => handleEdit(post)}>Edit</button>
                      </div>
                    }
               
            </div>
     );
}
export default MyListings;