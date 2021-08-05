import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router';

function SavedPage() {
    const dispatch = useDispatch();

    const [isVisible, setIsVisible] = useState(false);
    const [postTitle, setTitle]= useState('');
    const [postDescription, setDescription]= useState('');
    const [postImage, setImage]= useState('');
    const [postPrice, setPrice]= useState('');
    const postings = useSelector(store => store.postings);

    useEffect(() => {
        dispatch({ type: 'GET_LISTINGS' });
    }, []);
      
      const handleDelete = (deleteItem) => {
        dispatch({ type: 'DELETE_ITEM', payload: deleteItem })
      }
        return (
            <div className="container">
              <h2>Shelf</h2>
              <p>All of the available items can be seen here.</p>
              {shelfItem.map(item => {
                return (
                  <ul key= {item.id}>
                    <li> {item.description} </li>
                    <img src={item.image_url} height= '100px' width= '100px' />
                    <button onClick={ () => handleDelete(item.id)}>Delete</button>
                    <button onClick={ () => handleEdit(item)}>Edit</button>
        
                  </ul>
                );
              })}
              { isVisible && 
                <>
                  <input type="text" value={description} onChange={(event) => setDescription(event.target.value)} />
                  <input type="text" value={image} onChange={(event) => setImage(event.target.value)} />
                  <button type="button" onClick={ () => handleSave()}>Save Changes</button>
                </>}
            </div>
     );
}
export default Saved;