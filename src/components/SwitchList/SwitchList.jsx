import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useHistory } from "react-router";
import "./SwitchList.css";
import { Card } from "@material-ui/core";

function SwitchList() {
  const dispatch = useDispatch();
  const switchesList = useSelector((store) => store.switches);
  const history = useHistory();

  useEffect(() => {
    dispatch({ type: "GET_SWITCHES" });
  }, []);

  return (
    <div>
      <h4>Switches</h4>
      <div id="displaySwitches">
        {switchesList.map((item) => {
          return (
            <Card className="switchContainer" key={item.id}>
              <center>
                <h4> {item.switch_name} </h4>
                <img src={item.image} height="200px" width="200px" />
              </center>
              <p> {item.description} </p>
              <p> {item.switch_type} </p>
              <p> {item.actuation_point} </p>
              <p> {item.switch_mount} </p>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

export default SwitchList;
