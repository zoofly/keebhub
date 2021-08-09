import { put, call, takeEvery } from 'redux-saga/effects';
import axios from 'axios';

function* editPostSaga (){
	yield takeEvery('EDIT_ITEM', editItem);
}

function* editItem (action){
	console.log(action);
	try {
		yield call(axios.put, `/market/${action.payload.id}`, action.payload);
		console.log(`What is in the PUT payload`, action.payload.id);
		yield put({type: 'GET_MY_LISTINGS'});
       
	} catch(error){
		console.log(`problem editing item`, error);
	}
}

export default editPostSaga;