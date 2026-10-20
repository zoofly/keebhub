import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@material-ui/core';
import PostingsList from '../PostingsList/PostingsList';
import Mapping from '../Map/Map';
import useDocumentTitle from '../../hooks/useDocumentTitle';

function Market() {
  useDocumentTitle('Market');

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Market</h1>
          <p className="page-lede">
            Keyboards, switches, keycaps, and parts from the community.
          </p>
        </div>
        <Button
          component={Link}
          to="/create"
          variant="contained"
          color="primary"
          size="large"
        >
          Create a listing
        </Button>
      </div>

      <PostingsList />

      <section className="section" aria-labelledby="map-heading">
        <h2 id="map-heading">Around the Twin Cities</h2>
        <Mapping />
      </section>
    </div>
  );
}

export default Market;
