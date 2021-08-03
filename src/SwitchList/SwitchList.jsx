import React, {useEffect} from "react";
import {useDispatch, useSelector} from 'react-redux';
import '../SwitchList/SwitchList.css';

function SwitchList() {
    const dispatch = useDispatch();
    const switches = useSelector(store => store.switches);
    
    return(
        <div className='switchList'>
            {}
        </div>


    )
}

export default SwitchList