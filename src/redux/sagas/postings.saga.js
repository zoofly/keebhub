import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';

function* postingsSaga(){
    yield takeEvery('GET_LISTINGS', fetchPosts); //should match up on client sided sagas
    yield takeEvery ('ADD_POST', addPost)
}

function* fetchPosts() {
    try {
        const response = yield axios.get('/market');
        yield put({ type: 'SET_POSTINGS', payload: response.data});
    } catch (error) {
        console.log('Error GETting posts', error);
    }
}

//saga to add a Post that was created
function* addPost(action) {
    try{
        console.log('in addPost', action.payload);
        yield call(axios.post, '/market', action.payload);
        yield put ({type: 'GET_LISTINGS'});
    } catch (error) {
        console.log('in addPost; failed to add posting', error);
    }
}

//delete generator function 

export default postingsSaga;