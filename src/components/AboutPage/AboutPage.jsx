import React from 'react';
import {Card} from '@material-ui/core';
import './AboutPage.css'

// This is one of our simplest components
// It doesn't have local state,
// It doesn't dispatch any redux actions or display any part of redux state
// or even care what the redux state is'

function AboutPage() {
  return (
    <Card className="AboutContainer">
      <div id='AboutDescription'>
        <h6>Keebhub is a market for the mechanical keyboard community to make trading, buying, and selling between users and vendors easier.
            No more sifting through Reddit posts on r/mechmarket that redirect you to unknown vendors!
        </h6>

        <h4 id='Technologies'> Technologies used: </h4>
        <ul>
          <li> React </li>
          <li> Node JS </li>
          <li> Express </li>
          <li> Redux </li>
        </ul>
      </div>
    </Card>
  );
}

export default AboutPage;
