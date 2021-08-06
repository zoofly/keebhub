import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';

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
    }
  
      const handleDelete = (deleteItem) => {
        dispatch({ type: 'DELETE_POST', payload: deleteItem })
      }

      const handleEdit = (postDetails) => {
        isVisibleToggle();
        setDescription(postDetails.description);
        setPrice(postDetails.price);
        setImage(postDetails.image);
        setEditItemId(postDetails.id);
        
      }
      
      const handleSave = () => {
        setPostDetails({
          title: postTitle,
          description: postDescription,
          price: postPrice,
          image: postImage,
          id: editItemId
        })
        dispatch({ type: 'EDIT_ITEM', payload: postDetails })
        isVisibleToggle();
      }
    
        return (
            <div className="container">
              <h2>Your Posts</h2>
              {myListings.map(post => {
                return (
                  <div key= {post.id}>
                    <h2> {post.title} </h2>
                    <p> {post.description} </p>
                    <p> ${post.price} </p>
                    <img src={post.image} height= '100px' width= '100px' />
                    <button onClick={ () => handleDelete(post.id)}>Delete</button>
                    <button onClick={ () => handleEdit(post)}>Edit</button>
                  
                  </div>
                );
              })}
                { isVisible && 
                <>
                   <input type="text" value={postTitle} onChange={(event) => setTitle(event.target.value)} />
                  <input type="text" value={postDescription} onChange={(event) => setDescription(event.target.value)} />
                  <input type="text" value={postImage} onChange={(event) => setImage(event.target.value)} />
                  <input type="text" value={postPrice} onChange={(event) => setPrice(event.target.value)} />
                  <button type="button" onClick={ () => handleSave()}>Save Changes</button>
                </>}
             
            </div>
     );
}
export default MyListings;