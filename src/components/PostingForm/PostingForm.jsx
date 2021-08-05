import  { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';


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
    <div className="container">
    <form>
            <input
            name= 'addTitle'
            type= 'text'
            value= {postTitle}
            placeholder= 'Title'
            onChange={handleTitle}>
                
            </input>

            <input
            name= 'addImage'
            type= 'text'
            value= {postImage}
            placeholder= 'Upload Image'
            onChange={handleImage}>
                
            </input>

            <input
            name= 'addDescription'
            type= 'text'
            value= {postDescription}
            placeholder= 'Description'
            onChange={handleDescription}>
                
            </input>

            <input
            name= 'addPrice'
            type= 'text'
            value= {postPrice}
            placeholder= 'Price'
            onChange={handlePrice}>
                
            </input>

            {/* <select
            id= 'addCondition'
            type= 'text'
            value= {postprice}
            onChange= {handleGenre}
            name='Genres'>
                <option value= '' defaultValue> Choose a Genre here </option>
                <option onClick={handleGenre} value='1' > Adventure </option>
                <option onClick={handleGenre} value= '2'> Animated </option>
                <option onClick={handleGenre} value= '3'> Biographical </option>
                <option onClick={handleGenre} value= '4'> Comedy </option>
                <option onClick={handleGenre} value='5'> Disaster </option>
                <option onClick={handleGenre} value='6'>  Drama </option>
                <option onClick={handleGenre} value= '7'> Epic </option>
                <option onClick={handleGenre} value='8'> Fantasy </option>
                <option onClick={handleGenre} value='9'> Musical </option>
                <option onClick={handleGenre} value='10'> Romantic </option>
                <option onClick={handleGenre} value='11'> Science Fiction </option>
                <option onClick={handleGenre} value='12'> Space-Opera </option>
                <option onClick={handleGenre} value= '13'>  Superhero </option>
                
            </select> */}

            <button type='submit' onClick={handleSave}> Save </button>
            <button onClick={handleCancel}> Cancel </button>
            
        </form>
    </div>
  );
}

export default PostingForm;