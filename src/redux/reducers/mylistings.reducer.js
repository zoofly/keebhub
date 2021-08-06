const myListings = (state = [], action) => {
    switch (action.type) {
        case 'SET__MY_LISTINGS':
            return action.payload;
        default: 
            return state;
    }
}


export default myListings;