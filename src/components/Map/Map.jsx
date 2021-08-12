// import React from "react";
// import { withScriptjs, withGoogleMap, GoogleMap, Marker,} from "react-google-maps";
// require('dotenv').config();

// function Map() {
//   return (
//     <GoogleMap
//       defaultZoom={10}
//       defaultCenter={{ lat: 44.989714, lng: -93.267567 }}
//     />
//   );
// }

// const WrappedMap = withScriptjs(withGoogleMap(Map));

// export default function Mapping() {
//   return (
//     <div style={{ width: "1000px", height: "500px" }}>
//       <WrappedMap
//         googleMapURL={`https://maps.googleapis.com/maps/api/js?v=3.exp&libraries=geometry,drawing,places&key=${process.env.REACT_APP_GOOGLE_MAPS_API}`}
//         loadingElement={<div style={{ height: `100%` }} />}
//         containerElement={<div style={{ height: `95%` }} />}
//         mapElement={<div style={{ height: `100%` }} />}
//       />
//     </div>
//   );
// }

import React from 'react';
import { GoogleMap, LoadScript } from '@react-google-maps/api';
require('dotenv').config();

const Mapping = () => {
  
  const mapStyles = {        
    height: "500px",
    width: "1000px"};
  
  const defaultCenter = {
    lat: 44.989987, lng:  -93.265334
  }
  console.log(process.env.REACT_APP_GOOGLE_MAPS);
  
  return (
     <LoadScript
       googleMapsApiKey={`${process.env.REACT_APP_GOOGLE_MAPS}`}>
        <GoogleMap
          mapContainerStyle={mapStyles}
          zoom={11}
          center={defaultCenter}
        />
     </LoadScript>
  )
}

export default Mapping;