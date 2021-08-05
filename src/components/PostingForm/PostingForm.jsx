import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';


function PostingForm() {
  
  const history= useHistory();
  
  const dispatch = useDispatch();
  const history= useHistory();
  const [postTitle, setTitle]= useState('');
  const [postDescription, setDescription]= useState('');
  const [postImage, setImage]= useState('');
  const [postPrice, setPrice]= useState('');

  const createHandler = () => {
    history.push('/mylistings')
  }
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
            name= 'addPoster'
            type= 'text'
            value= {moviePoster}
            placeholder= 'Enter Movie Poster URL'
            onChange={handlePoster}>
                
            </input>

            <input
            name= 'addDescription'
            type= 'text'
            value= {movieDescription}
            placeholder= 'Enter Movie Description'
            onChange={handleDescription}>
                
            </input>

            <select
            id= 'addGenre'
            type= 'text'
            value= {movieGenre}
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
                
            </select>

            <button type='submit' onClick={handleSave}> Save </button>
            <button onClick={handleCancel}> Cancel </button>
            
        </form>
    </div>
  );
}

export default PostingForm;