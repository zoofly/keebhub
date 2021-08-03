import React from 'react';

// This is one of our simplest components
// It doesn't have local state,
// It doesn't dispatch any redux actions or display any part of redux state
// or even care what the redux state is'

function AboutPage() {
  return (
    <div className="container">
      <div>
        <p>Keebhub is a market for the mechanical keyboard community to make trading, buying, and selling between users and vendors easier.
            No more sifting through Reddit posts on r/mechmarket that redirect you to unknown vendors!
        </p>
      </div>
    </div>
  );
}

export default AboutPage;
