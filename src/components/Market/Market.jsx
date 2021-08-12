import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import PostingsList from '../PostingsList/PostingsList';
import Mapping from '../Map/Map';
import './Market.css';
import Button from '@material-ui/core/Button';
require('dotenv').config();


function Market() {
  
  const history= useHistory();
  
  const createHandler = () => {
    history.push('/create')
  }

  return (
    <div id="MarketContainer">
      <h1 id='marketHeader' >Market Page</h1>
      <Button id='CreateBtn' variant='contained' color='secondary' onClick={createHandler}> Create a New Listing </Button>
      <Mapping />
      <div id='ListingsContainer'>
        <PostingsList />
        </div>
      
    </div>
  );
}

export default Market;
