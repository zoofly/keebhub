const myListings = (state = [], action) => {
  switch (action.type) {
    case "SET_MY_LISTINGS":
      return action.payload;
    default:
      return state;
  }
};

export default myListings;
