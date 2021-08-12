import React, { useState } from 'react';
import { useHistory } from 'react-router-dom';
import {useSelector} from 'react-redux';
import './LandingPage.css';

// CUSTOM COMPONENTS
import RegisterForm from '../RegisterForm/RegisterForm';
import SwitchList from '../SwitchList/SwitchList';

function LandingPage() {
  const user = useSelector((store) => store.user);
  const [heading, setHeading] = useState('Hello There');
  const history = useHistory();

  const onLogin = (event) => {
    history.push('/login');
  };

  return (
    <div id="SwitchListContainer">
      <h2 id='GreetingHeader'>{heading}</h2>

      <div className="grid">
        <div className="grid-col grid-col_8">
          <h3 id='WelcomeHeader'>
            Welcome to Keebhub! 
          </h3> 
          <SwitchList />
        </div>
       
        {!user.id && (
        <div className="grid-col grid-col_4">
          <RegisterForm />

          <center>
            <h4>Already a Member?</h4>
            <button className="btn btn_sizeSm" onClick={onLogin}>
              Login
            </button>
          </center>
        </div>
         )}
      </div>
    </div>
  );
}

export default LandingPage;
