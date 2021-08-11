import './SearchBar.css';
import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';

function Search(){
    const dispatch = useDispatch();
    const [search, setSearch] = useState('');
    const searchResults = useSelector((store) => store.searchResults);
    console.log(`Search results from Search component`, searchResults);

    const handleSearchChange = () => {
        setSearch(event.target.value);
      };

      const getSearchResults = (event) => {
        event.preventDefault();
        dispatch({ type: "FETCH_SEARCH", payload: search });
      };

      const handleFavoriteClick = (gifUrl) => {
        dispatch({type: "FAVORITE_GIF", payload: {url: gifUrl}})
      };

    return (
    <>
    <input 
    className='SearchBox' type='text'   
    value={search}
    onChange={handleSearchChange} placeholder='Search' /> 
    <button className="searchButton" type="submit">Search</button>
    </>
    )

}


export default Search;