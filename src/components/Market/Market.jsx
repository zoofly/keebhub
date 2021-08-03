import React from 'react';


// This is one of our simplest components
// It doesn't have local state
// It doesn't dispatch any redux actions or display any part of redux state
// or even care what the redux state is

function Market() {
  return (
    <div className="container">
      <p>Market Page</p>
      <p> MAP OUT LIST OF SWITCHES HERE </p>
    </div>
  );
}

export default Market;
