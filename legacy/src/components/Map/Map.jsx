import React, { useState } from 'react';
import { GoogleMap, LoadScript } from '@react-google-maps/api';
import StatusMessage from '../StatusMessage/StatusMessage';
import './Map.css';

const apiKey = process.env.REACT_APP_GOOGLE_MAPS;

const mapStyles = {
  height: '100%',
  width: '100%',
};

const defaultCenter = {
  lat: 44.989987,
  lng: -93.265334,
};

const Mapping = () => {
  const [loadError, setLoadError] = useState(false);

  if (!apiKey || loadError) {
    return (
      <StatusMessage title="Map unavailable">
        The map can't be shown right now. Listings above still work as usual.
      </StatusMessage>
    );
  }

  return (
    <div className="map-frame">
      <LoadScript
        googleMapsApiKey={apiKey}
        loadingElement={<StatusMessage variant="loading">Loading map…</StatusMessage>}
        onError={() => setLoadError(true)}
      >
        <GoogleMap mapContainerStyle={mapStyles} zoom={11} center={defaultCenter} />
      </LoadScript>
    </div>
  );
};

export default Mapping;
