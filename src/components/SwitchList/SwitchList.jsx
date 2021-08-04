import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import './SwitchList.css'

function SwitchList() {

    const dispatch = useDispatch();
    const switches = useSelector(store => store.switches);
    const history= useHistory();

    useEffect(() => {
        dispatch({ type: 'FETCH_MOVIES' });
    }, []);

    const handleClick= (details) => {
        dispatch({ type: 'GET_MOVIE_DETAILS', payload: details.id})
        history.push(`/details/${details.id}`);
    }
   
    return (
        <main>
            <h1>Movie List</h1>
            <section className="movies">
                {movies.map(movie => {
                    return (
                        <div key={movie.id} >
                            <h3>{movie.title}</h3>
                            <img src={movie.poster} alt={movie.title} onClick= {()=> handleClick(movie)}/>
                        </div>
                    );
                })}
            </section>
        </main>

    );
}

export default SwitchList;