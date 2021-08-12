const switches = (state = [], action) => {
  switch (action.type) {
    case "SET_SWITCHES":
      return action.payload;
    default:
      return state;
  }
};

export default switches;
