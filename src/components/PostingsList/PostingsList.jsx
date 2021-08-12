import './PostingsList.css';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import {Container, Card} from '@material-ui/core'

function PostingsList() {
    const dispatch = useDispatch();
    const postings = useSelector(store => store.postings);
    const [favorite, setFavorite] = useState(false);

    useEffect(() => {
        dispatch({ type: 'GET_LISTINGS' });
    }, []);

    return (
        <Container className='Container'>
        {postings.map(post =>{
            return (
              <Card className='indPost' key={post.id}> 
                <h2> {post.title}</h2>
                <h3> ${post.price} </h3>
                <center>
                  <img src={post.image} width='200px' height='200px'/>
                </center>
                <p> {post.description} </p>
                
              </Card>
            )
          })}
        </Container>
    )
}


export default PostingsList;