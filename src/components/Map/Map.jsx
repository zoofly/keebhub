import React from "react";
import { GoogleMap, LoadScript } from "@react-google-maps/api";
require("dotenv").config();

const Mapping = () => {
  const mapStyles = {
    height: "500px",
    width: "1000px",
  };

  const defaultCenter = {
    lat: 44.989987,
    lng: -93.265334,
  };
  console.log(process.env.REACT_APP_GOOGLE_MAPS);

  return (
    <LoadScript googleMapsApiKey={`${process.env.REACT_APP_GOOGLE_MAPS}`}>
      <GoogleMap
        mapContainerStyle={mapStyles}
        zoom={11}
        center={defaultCenter}
      />
    </LoadScript>
  );
};

export default Mapping;
