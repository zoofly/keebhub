import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import './Market.css';


// This is one of our simplest components
// It doesn't have local state
// It doesn't dispatch any redux actions or display any part of redux state
// or even care what the redux state is

function Market() {
  const dispatch = useDispatch();
  const postings = useSelector(store => store.postings);
  const history= useHistory();

  useEffect(() => {
    dispatch({ type: 'GET_LISTINGS' });
}, []);

  return (
    <div className="container">
      <p>Market Page</p>
      {postings.map(post =>{
        return (
          <div className='postContainer' key={post.id}>
            <p> {post.title}</p>
            <img src={post.image} width='200px' height='200px'/>
            <p> {post.price} </p>
          </div>
        )
      })}
    </div>
  );
}

export default Market;
