import  { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import {Input, Card, Box, TextField} from '@material-ui/core';
import './PostingForm.css';


function PostingForm() {
  
  const dispatch = useDispatch();
  const history= useHistory();
  const [postTitle, setTitle]= useState('');
  const [postDescription, setDescription]= useState('');
  const [postImage, setImage]= useState('');
  const [postPrice, setPrice]= useState('');

  const newPost = {
    title: postTitle,
    image: postImage,
    description: postDescription,
    price: postPrice

}

  const handleCancel= (event) =>{
    event.preventDefault();
    history.push('/market');

}

const handleSave= (event) => {
    event.preventDefault();
    console.log('successfully saved post');
    dispatch({type: 'ADD_POST', payload: newPost});
    history.push('/market')
    alert('Successfully Added!');
    setDescription('');
    setPrice('');
    setImage('');
    setTitle('');


}

const handleTitle= (event) =>{
    event.preventDefault();
    setTitle(event.target.value);
};

const handleDescription= (event) =>{
    event.preventDefault();
    setDescription(event.target.value);
};

const handleImage= (event) =>{
    event.preventDefault();
    setImage(event.target.value);
};

const handlePrice= (event) =>{
    event.preventDefault();
    setPrice(event.target.value);
};

  return (
    <Card id='formContainer' className="container">
      <h2 id='formHeader'> Create a Listing </h2>
      <form>
            <TextField 
            label= 'Title'
            name= 'addTitle'
            type= 'text'
            value= {postTitle}
            placeholder= 'Title'
            onChange={handleTitle}>
                
            </TextField>
            <br/>

            <TextField
            label='Image URL'
            name= 'addImage'
            type= 'text'
            value= {postImage}
            placeholder= 'Upload Image'
            onChange={handleImage}>
                
            </TextField>
              <br/>
            <TextField
            label='Description'
            name= 'addDescription'
            type= 'text'
            value= {postDescription}
            placeholder= 'Description'
            onChange={handleDescription}>
                
            </TextField>
            <br/>
            <TextField
            label='Price'
            name= 'addPrice'
            type= 'text'
            value= {postPrice}
            placeholder= 'Price'
            onChange={handlePrice}>
                
            </TextField>

            <br/>
            <div id='formBtns'>
            <button type='submit' onClick={handleSave}> Save </button>
            <button onClick={handleCancel}> Cancel </button>
            </div>
        </form>
    </Card>
  );
}

export default PostingForm;