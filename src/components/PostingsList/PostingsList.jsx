import './PostingsList.css';
import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';

function PostingsList() {
    const dispatch = useDispatch();
    const postings = useSelector(store => store.postings);

    useEffect(() => {
        dispatch({ type: 'GET_LISTINGS' });
    }, []);

    return (
        <div className='Container'>
        {postings.map(post =>{
            return (
              <div className='indPost' key={post.id}>
                <h2> {post.title}</h2>
                <h3> ${post.price} </h3>
                <center>
                  <img src={post.image} width='200px' height='200px'/>
                </center>
                <p> {post.description} </p>
                
              </div>
            )
          })}
        </div>
    )
}


export default PostingsList;