import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import './SwitchList.css'

function SwitchList() {

    const dispatch = useDispatch();
    const switches = useSelector(store => store.switches);
    const history= useHistory();

    useEffect(() => {
        dispatch({ type: 'GET_SWITCHES' });
    }, []);

    // const handleClick= (details) => {
    //     dispatch({ type: 'GET_SWITCHES_DETAILS', payload: details.id})
    //     history.push(`/details/${details.id}`);
    // }
   
    return (
        <main>
            <h1>Switches</h1>
            <section className="switchesList">
                {switches.map(switch => {
                    return (
                        <section className='switchContainer' key={switch.id}>
                        <p> {switch.switch_name} </p>
                        <p> {switch.description} </p>
                        <img src={switch.image} height= '200px' width= '200px'/> 
                        </section>
                    );
                })}
            </section>
        </main>

    );
}

export default SwitchList;