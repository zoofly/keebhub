import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import PostingsList from '../PostingsList/PostingsList';
import Mapping from '../Map/Map';
import Search from '../SearchBar/SearchBar';
import './Market.css';
import Button from '@material-ui/core/Button';


function Market() {
  
  const history= useHistory();
  
  const createHandler = () => {
    history.push('/create')
  }
  return (
    <div className="container">
      <h1 id='marketHeader' >Market Page</h1>
      <Search />
      <Button id='CreateBtn' variant='contained' color='secondary' onClick={createHandler}> Create a New Listing </Button>
      <Mapping />
      <PostingsList />
    </div>
  );
}

export default Market;
