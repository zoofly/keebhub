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
        <>
        {postings.map(post =>{
            return (
              <div className='postContainer' key={post.id}>
                <h2> {post.title}</h2>
                <h3> ${post.price} </h3>
                <img src={post.image} width='200px' height='200px'/>
                <p> {post.description} </p>
                
              </div>
            )
          })}
        </>
    )
}


export default PostingsList;