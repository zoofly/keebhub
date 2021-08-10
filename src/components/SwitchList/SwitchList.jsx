import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';
import './SwitchList.css'

function SwitchList() {

    const dispatch = useDispatch();
    const switchesList = useSelector(store => store.switches);
    const history= useHistory();

    useEffect(() => {
        dispatch({ type: 'GET_SWITCHES' });
    }, []);

    // const handleClick= (details) => {
    //     dispatch({ type: 'GET_SWITCHES_DETAILS', payload: details.id})
    //     history.push(`/details/${details.id}`);
    // }
   
    return (
        <div>
            
            <h4>Switches</h4>
                {switchesList.map((item) => {
                    return (
                        <div className='switchContainer' key={item.id}>
                        <p> {item.switch_name} </p>
                        <img src={item.image} height= '200px' width= '200px'/>
                        <p> {item.description} </p>
                        <p> {item.switch_type} </p>
                        <p> {item.actuation_point} </p>
                        <p> {item.switch_mount} </p>
                        
                        </div>
                    );
                })}
            
        </div>

    );
}

export default SwitchList;