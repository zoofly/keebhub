import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import PostingsList from '../PostingsList/PostingsList';
import './Market.css';


function Market() {
  
  const history= useHistory();
  
  const createHandler = () => {
    history.push('/create')
  }
  return (
    <div className="container">
      <h1>Market Page</h1>
      <button onClick={createHandler}> Create a New Listing </button>
      <PostingsList />
    </div>
  );
}

export default Market;
