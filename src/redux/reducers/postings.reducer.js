const postings = (state = [], action) => {
  switch (action.type) {
    case "SET_POSTINGS":
      return action.payload;
    default:
      return state;
  }
};

export default postings;
