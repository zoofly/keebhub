import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import PostingsList from '../PostingsList/PostingsList';
import Mapping from '../Map/Map';
import Search from '../SearchBar/SearchBar';
import './Market.css';



function Market() {
  
  const history= useHistory();
  
  const createHandler = () => {
    history.push('/create')
  }
  return (
    <div className="container">
      <h1 id='marketHeader' >Market Page</h1>
      <Search />
      <button id='CreateBtn' onClick={createHandler}> Create a New Listing </button>
      <Mapping />
      <PostingsList />
    </div>
  );
}

export default Market;
