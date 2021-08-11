import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import PostingsList from '../PostingsList/PostingsList';
import './Market.css';



function Market() {
  const [favorite, setFavorite] = useState(false)
  const history= useHistory();
  
  const createHandler = () => {
    history.push('/create')
  }
  return (
    <div className="container">
      <h1 id='marketHeader' >Market Page</h1>
      <input className='SearchBox' type='text' placeholder='Search' /> <button id='CreateBtn' onClick={createHandler}> Create a New Listing </button>
      <PostingsList />
    </div>
  );
}

export default Market;
