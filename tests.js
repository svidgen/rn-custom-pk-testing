import awsconfig from './src/aws-exports';
import { Amplify, API, DataStore } from 'aws-amplify';
import { BasicModel, Post, Comment } from './src/models';
import * as mutations from './src/graphql/mutations';

const makeID = () => {
    const chars = [];
    for (let i = 0; i < 32; i++) {
        chars.push(
            '0123456789abcdef'[Math.floor(Math.random() * 16)]
        );
    }
    return chars.join('');
};

const waitForObserve = ({
  model,
  predicate = undefined,
  count = 1,
  timeout = 5000
}) => new Promise((resolve, reject) => {
  let timer;
  const events = [];

  const subscription = DataStore.observe(model, predicate).subscribe(event => {
    events.push(event);
    if (events.length === count) {
      subscription.unsubscribe();
      clearTimeout(timer);
      resolve(events);
    }
  });

  timer = setTimeout(() => {
    subscription.unsubscribe();
    reject("observe() timed out");
  }, timeout);
});

const waitForSnapshots = ({
  model,
  predicate = undefined,
  time = 3000
}) => new Promise(resolve => {
  let timer;
  const snapshots = [];

  const subscription = DataStore.observeQuery(model, predicate).subscribe(({items}) => {
    snapshots.push(items);
  });

  timer = setTimeout(() => {
    subscription.unsubscribe();
    resolve(snapshots);
  }, time);
});

/**
 * "Lite" implementation of jest expect style testing ... because
 * I thought I could just import `expect` from jest, and ... i guess i can't?
 * 
 * Anyway. Super quick, lite hackish bridge until I decide on something better.
 * 
 * @param {*} value 
 * @returns 
 */
const expect = (value) => {
    return {
        toBeDefined: () => {
            return value !== undefined;
        },
        toEqual: (expected) => {
            if (Array.isArray(expected)) {
                expect(value.length).toEqual(expected.length);
                for (let i = 0; i < expected.length; i++) {
                    expect(value[i]).toEqual(expected[i]);
                }
            } else if (typeof expected === 'object') {
                expect(Object.keys(value)).toEqual(Object.keys(expected));
                for (const key of Object.keys(expected)) {
                    expect(value[key]).toEqual(expected[key]);
                }
            } else {
                return value === expected;
            }
        },
        toBeFalsy: () => {
            return !value;
        },
        rejects: {
            toThrow: async () => {
                try {
                    await value();
                } catch (err) {
                    return true;
                }

                // didn't throw!
                throw new Error("Expected and error");
            }
        }
    }
}

export default async function({ describe, test, getTestName }) {

    Amplify.configure(awsconfig);

    await DataStore.clear();
    await new Promise(unsleep => setTimeout(unsleep, 3000));
  
    describe("Sanity checks", () => {
      test("test name is accessible", () => {
        expect(getTestName(), "test name is accessible")
      });
    })
        
    describe("Basic", () => {
      describe("Save", () => {
    
        test("Can save a basic model", async () => {
          const saved = await DataStore.save(new BasicModel({
            body: getTestName()
          }))
          expect(saved).toBeDefined();
          expect(saved.id).toBeDefined();
        });
    
        test("can save a post (HAS_MANY parent) with an ID", async () => {
          const post = await DataStore.save(new Post({
            postId: makeID(),
            title: getTestName()
          }));
      
          expect(post).toBeDefined();
          expect(post.postId).toBeDefined()
        })
    
        test("can create a comment with an ID", async () => {
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: getTestName()
          }))
          expect(comment).toBeDefined();
          expect(comment.commentId).toBeDefined();
        });
      });
    
      describe("Query", () => {
        test("can retrieve a created post by PK", async () => {
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title: getTestName()
          }));
      
          const retrieved = await DataStore.query(Post, {...saved});
      
          expect(retrieved.postId).toEqual(saved.postId);
          expect(retrieved.title).toEqual(saved.title);
        });
    
        test("can retrieve a created post by PK predicate", async () => {
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title: getTestName()
          }));
      
          const retrieved = (await DataStore.query(Post, p => p.postId("eq", saved.postId))).pop();
      
          expect(retrieved.postId).toEqual(saved.postId);
          expect(retrieved.title).toEqual(saved.title);
        });
    
        test("can retrieve a created comment by PK", async () => {
          const saved = await DataStore.save(new Comment({
            commentId: makeID(),
            content: getTestName(),
          }));
      
          const retrieved = await DataStore.query(Comment, {...saved});
          expect(retrieved.commentId).toEqual(saved.commentId);
          expect(retrieved.content).toEqual(saved.content);
        });
    
        test("can retrieve a created comment by PK predicate", async () => {
          const saved = await DataStore.save(new Comment({
            commentId: makeID(),
            content: getTestName(),
          }));
      
          const retrieved = (await DataStore.query(Comment, c => c.commentId("eq", saved.commentId))).pop();
    
          expect(retrieved.commentId).toEqual(saved.commentId);
          expect(retrieved.content).toEqual(saved.content);
        });
    
        test("can retrieve all posts", async () => {
          const postCountToCreate = 5;
    
          const isolationId = makeID();
    
          for (let i = 0; i < postCountToCreate; i++) {
            await DataStore.save(new Post({
              postId: makeID(),
              title: `${getTestName()} - ${isolationId} - ${i}`
            }));
          }
    
          const retrieved = (await DataStore.query(Post)).filter(
            p => p.title.startsWith(`${getTestName()} - ${isolationId}`)
          );
    
          expect(retrieved.length).toEqual(postCountToCreate);
        })
      });
    
      describe("Update", () => {
    
        test("can update basic model (sanity check)", async () => {
          const saved = await DataStore.save(new BasicModel({
            body: getTestName()
          }));
      
      
          const retrieved = await DataStore.query(BasicModel, saved.id);
          const updated = await DataStore.save(BasicModel.copyOf(retrieved, draft => {
            draft.body = `${retrieved.body} - edited`
          }));
    
          const retrievedUpdated = await DataStore.query(BasicModel, saved.id);
    
          expect(updated.body).toEqual(`${saved.body} - edited`);
          expect(retrievedUpdated.body).toEqual(`${saved.body} - edited`);
        });
    
        test.skip("cannot update Post (HAS_ONE parent) SK", async () => {
          const isolationId = makeID();
          const baseTitle = `${getTestName()} - ${isolationId}`;
    
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title: baseTitle
          }));
          expect(saved.postId).toBeDefined();
      
          const retrieved = await DataStore.query(Post, saved.postId);
          expect(retrieved.postId).toEqual(saved.postId);
          expect(retrieved.title).toEqual(saved.title);
    
          expect(() => {
            Post.copyOf(retrieved, draft => {
              draft.title =`${baseTitle} - edited`;
            })
          }).toThrow();
        });
    
    
        test.skip("cannot update Post (HAS_ONE parent) Cluster key", async () => {
          const isolationId = makeID();
          const baseTitle = `${getTestName()} - ${isolationId}`;
    
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title: baseTitle
          }));
          expect(saved.postId).toBeDefined();
      
          const retrieved = await DataStore.query(Post, saved.postId);
          expect(retrieved.postId).toEqual(saved.postId);
          expect(retrieved.title).toEqual(saved.title);
    
          expect(() => {
            Post.copyOf(retrieved, draft => {
              draft.id = makeID();
            })
          }).toThrow();
        });
    
        test("can update post on Comment (BELONGS_TO FK)", async () => {
          const isolationId = makeID();
    
          const postA = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post A`
          }));
    
          const postB = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post B`
          }));
    
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`,
            post: postA
          }));
    
          const retrievedComment = await DataStore.query(Comment, {...comment});
    
          const updated = await DataStore.save(Comment.copyOf(retrievedComment, c => {
            c.post = postB
          }));
    
          const retrievedUpdated = await DataStore.query(Comment, {...comment});
    
          expect(retrievedUpdated).toBeDefined();
          expect(retrievedUpdated.post.postId).toEqual(postB.postId);
        });
        
      });
    
      describe("Delete", () => {
        test("can delete BasicModel by instance", async () => {
          const isolationId = makeID();
          const item = await DataStore.save(new BasicModel({
            body: `${getTestName()} - ${isolationId}`
          }));
    
          const retrievedBeforeDelete = await DataStore.query(BasicModel, item.id);
    
          await DataStore.delete(item);
    
          const retrievedAfterDelete = await DataStore.query(BasicModel, item.id);
    
          expect(retrievedBeforeDelete).toBeDefined();
          expect(retrievedAfterDelete).toBeFalsy();
        });
  
        test("can delete BasicModel by non-existent PK results in no error ", async () => {
          const isolationId = makeID();
          const item = await DataStore.save(new BasicModel({
            body: `${getTestName()} - ${isolationId}`
          }));
    
          const retrievedBeforeDelete = await DataStore.query(BasicModel, item.id);
    
          const deleted = await DataStore.delete(BasicModel, "does not exist");
    
          const retrievedAfterDelete = await DataStore.query(BasicModel, item.id);
    
          expect(retrievedBeforeDelete).toBeDefined();
          expect(retrievedAfterDelete).toBeDefined();
          expect(deleted).toEqual([]);
        });
  
        /**
         * Existing behavior. Un-skip once this produces a better error.
         */
        test.skip("can delete BasicModel by bad PK results in meaningful error ", async () => {
          const isolationId = makeID();
          const item = await DataStore.save(new BasicModel({
            body: `${getTestName()} - ${isolationId}`
          }));
    
          const retrievedBeforeDelete = await DataStore.query(BasicModel, item.id);
    
          const deleted = await DataStore.delete(BasicModel, 123);
    
          const retrievedAfterDelete = await DataStore.query(BasicModel, item.id);
    
          expect(retrievedBeforeDelete).toBeDefined();
          expect(retrievedAfterDelete).toBeDefined();
          expect(deleted).toEqual([]);
        });
    
        test("can delete Post by instance", async () => {
          const isolationId = makeID();
          const post = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post`
          }))
    
          await DataStore.delete(post);
    
          const retrieved = await DataStore.query(Post, post);
    
          expect(retrieved).toBeFalsy();
        });
    
        test("can delete Post by PK", async () => {
          const isolationId = makeID();
          const post = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post`
          }))
    
          await DataStore.delete(Post, {
            postId: post.postId,
            title: post.title
          });
    
          const retrieved = await DataStore.query(Post, post);
    
          expect(retrieved).toBeFalsy();
        });
    
        test("can delete Post by PK predicate", async () => {
          const isolationId = makeID();
          const post = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post`
          }))
    
          await DataStore.delete(Post, p =>
            p.postId("eq", post.postId).title("eq", post.title)
          );
    
          const retrieved = await DataStore.query(Post, post);
    
          expect(retrieved).toBeFalsy();
        });
    
        test("can delete Post by PK cluster key", async () => {
          const isolationId = makeID();
          const post = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post`
          }));
      
          await DataStore.delete(Post, p => p.postId("eq", post.postId));
      
          const retrieved = await DataStore.query(Post, post);
      
          expect(retrieved).toBeFalsy();
        });
      
        test("can delete Comment by instance", async () => {
          const isolationId = makeID();
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`
          }));
      
          await DataStore.delete(comment);
      
          const retrieved = await DataStore.query(Comment, comment);
      
          expect(retrieved).toBeFalsy();
        });
      
        test("can delete Comment by PK cluster key", async () => {
          const isolationId = makeID();
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`
          }));
      
          await DataStore.delete(Comment, {
            commentId: comment.commentId,
            content: comment.content
          });
      
          const retrieved = await DataStore.query(Comment, comment);
      
          expect(retrieved).toBeFalsy();
        });
    
        test("can delete Comment by PK predicate", async () => {
          const isolationId = makeID();
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`
          }))
      
          await DataStore.delete(Comment,
            c => c.commentId('eq', comment.commentId).content('eq', comment.content)
          );
      
          const retrieved = await DataStore.query(Comment, comment);
      
          expect(retrieved).toBeFalsy();
        });
  
        test("can delete non-existent Comment without error", async () => {
          const isolationId = makeID();
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`
          }))
      
          const deleted = await DataStore.delete(Comment, {
            commentId: comment.commentId,
            content: "does not exist"
          });
      
          const retrieved = await DataStore.query(Comment, comment);
      
          expect(retrieved).toBeDefined();
          expect(deleted).toEqual([]);
        });
  
        /**
         * Existing behavior. Un-skip once this produces a better error.
         */
        test.skip("attempting to deleting Comment with partial key error is meaningful", async () => {
          const isolationId = makeID();
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`
          }))
      
          const deleted = await DataStore.delete(Comment, {
            commentId: comment.commentId,
  
            // missing SK
            // content: "..."
          });
      
          const retrieved = await DataStore.query(Comment, comment);
      
          expect(retrieved).toBeDefined();
          expect(deleted).toEqual([]);
        });
      });
    });
    
    describe("observe", () => {
      describe("sanity checks", () => {
        test("can observe INSERT on ALL changes to BasicModel", async () => {
          const isolationId = makeID();
    
          const pendingUpdates = waitForObserve({model: BasicModel});
          await DataStore.save(new BasicModel({
            body: `${getTestName()} - ${isolationId}`
          }))
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('INSERT');
          expect(updates[0].element.body).toEqual(`${getTestName()} - ${isolationId}`);
        });
    
        test("can observe UPDATE on ALL changes to BasicModel", async () => {
          const isolationId = makeID();
    
          const saved = await DataStore.save(new BasicModel({
            body: `${getTestName()} - ${isolationId}`
          }))
    
          const pendingUpdates = waitForObserve({model: BasicModel});
          await DataStore.save(BasicModel.copyOf(saved, updated => {
            updated.body = `${getTestName()} - ${isolationId} - edited`
          }));
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('UPDATE');
          expect(updates[0].element.body).toEqual(`${getTestName()} - ${isolationId} - edited`);
        });
    
        test("can observe DELETE on ALL changes to BasicModel", async () => {
          const isolationId = makeID();
    
          const saved = await DataStore.save(new BasicModel({
            body: `${getTestName()} - ${isolationId}`
          }))
    
          const pendingUpdates = waitForObserve({model: BasicModel});
          await DataStore.delete(saved);
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('DELETE');
          expect(updates[0].element.body).toEqual(`${getTestName()} - ${isolationId}`);
        });
  
        test("can observe changes from another client", async () => {
          const isolationId = makeID();
  
          const id = makeID();
          const body = `${getTestName()} - ${isolationId}`;
  
          const pendingCreates = waitForObserve({
            model: BasicModel,
            predicate: m => m.id("eq", id)
          });
  
          await API.graphql({
            query: mutations.createBasicModel,
            variables: {
              input: {
                id,
                body,
                _version: 0
              }
            }
          });
  
          const creates = await pendingCreates;
          expect(creates).toBeDefined();
          expect(creates[0].element.body).toEqual(body)
  
          const pendingUpdates = waitForObserve({
            model: BasicModel,
            predicate: m => m.id("eq", id)
          });
  
          await API.graphql({
            query: mutations.updateBasicModel,
            variables: {
              input: {
                id,
                body: body + ' edited',
                _version: 1
              }
            }
          });
  
          const updates = await pendingUpdates;
  
          expect(updates).toBeDefined();
          expect(updates[0].element.body).toEqual(body + ' edited')
  
          const pendingDeletes = waitForObserve({
            model: BasicModel,
            predicate: m => m.id("eq", id)
          });
  
          await API.graphql({
            query: mutations.deleteBasicModel,
            variables: {
              input: {
                id,
                _version: 2
              }
            }
          });
  
          const deletes = await pendingDeletes;
          expect(deletes).toBeDefined();
          expect(deletes[0].element.body).toEqual(body + ' edited')
          
        });
  
      });
    
      describe("CPK models", () => {
    
        
        test("can observe INSERT on ALL changes to Post", async () => {
  
          /**
           * Due to execution order, this test fails when run alongside the rest
           * of the test suite without some padding ...
           */
  
          await new Promise(unsleep => setTimeout(unsleep, 2000));
  
          const isolationId = makeID();
    
          const pendingUpdates = waitForObserve({model: Post});
          await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId}`
          }))
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('INSERT');
          expect(updates[0].element.title).toEqual(`${getTestName()} - ${isolationId}`);
        });
    
        test("can observe INSERT on changes to Post by predicate", async () => {
          const isolationId = makeID();
    
          const pendingUpdates = waitForObserve({
            model: Post,
            predicate: p => p.title("eq", `${getTestName()} - ${isolationId}`)
          });
          await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId}`
          }))
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('INSERT');
          expect(updates[0].element.title).toEqual(`${getTestName()} - ${isolationId}`);
        });
    
        /**
         * No test for editing Post because we don't have editable fields on Post.
         */
    
         test("can observe UPDATE on ALL changes to Comment", async () => {
          const isolationId = makeID();
    
          const postA = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post A`
          }));
    
          const postB = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post B`
          }));
    
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`,
            post: postA
          }));
    
          const pendingUpdates = waitForObserve({model: Comment});
          const updated = await DataStore.save(Comment.copyOf(comment, draft => {
            draft.post = postB
          }));
          expect(updated).toBeDefined();
          expect(updated.commentId, comment.commentId);
    
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('UPDATE');
          expect(updates[0].element.content).toEqual(`${getTestName()} - ${isolationId} - comment`);
          expect(updates[0].element.post.postId).toEqual(postB.postId);
        });
    
        test("can observe UPDATE on changes to Comment by predicate", async () => {
          const isolationId = makeID();
    
          const postA = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post A`
          }));
    
          const postB = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post B`
          }));
    
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`,
            post: postA
          }));
    
          const pendingUpdates = waitForObserve({
            model: Comment,
            predicate: c => c.content('eq', `${getTestName()} - ${isolationId} - comment`)
          });
          const updated = await DataStore.save(Comment.copyOf(comment, draft => {
            draft.post = postB
          }));
          expect(updated).toBeDefined();
          expect(updated.commentId, comment.commentId);
    
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('UPDATE');
          expect(updates[0].element.content).toEqual(`${getTestName()} - ${isolationId} - comment`);
          expect(updates[0].element.post.postId).toEqual(postB.postId);
        });
    
        test("can observe UPDATE on changes to Comment by PK predicate", async () => {
          const isolationId = makeID();
    
          const postA = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post A`
          }));
    
          const postB = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post B`
          }));
    
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`,
            post: postA
          }));
    
          const pendingUpdates = waitForObserve({
            model: Comment,
            predicate: c => c
              .commentId('eq', comment.commentId)
              .content('eq', comment.content)
          });
          const updated = await DataStore.save(Comment.copyOf(comment, draft => {
            draft.post = postB
          }));
          expect(updated).toBeDefined();
          expect(updated.commentId).toEqual(comment.commentId);
    
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('UPDATE');
          expect(updates[0].element.content).toEqual(`${getTestName()} - ${isolationId} - comment`);
          expect(updates[0].element.post.postId).toEqual(postB.postId);
        });
    
        /**
         * Not supported. When we get a better error than "TypeError: existing is not
         * a function", let's add a check here for the better error.
         */
        test.skip("can observe UPDATE on changes to Comment by PK object", async () => {
          const isolationId = makeID();
    
          const postA = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post A`
          }));
    
          const postB = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post B`
          }));
    
          const comment = await DataStore.save(new Comment({
            commentId: makeID(),
            content: `${getTestName()} - ${isolationId} - comment`,
            post: postA
          }));
    
          const pendingUpdates = waitForObserve({
            model: Comment,
            predicate: {
              commentId: comment.commentId,
              content: comment.content
            }
          });
          const updated = await DataStore.save(Comment.copyOf(comment, draft => {
            draft.post = postB
          }));
          expect(updated).toBeDefined();
          expect(updated.commentId).toEqual(comment.commentId);
    
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('UPDATE');
          expect(updates[0].element.content).toEqual(`${getTestName()} - ${isolationId} - comment`);
          expect(updates[0].element.post.postId).toEqual(postB.postId);
        });
    
        test("can observe DELETE on ALL changes to Post", async () => {
          const isolationId = makeID();
    
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId}`
          }))
    
          const pendingUpdates = waitForObserve({model: Post});
          await DataStore.delete(saved);
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('DELETE');
          expect(updates[0].element.title).toEqual(`${getTestName()} - ${isolationId}`);
        });
    
        test("can observe DELETE on changes to Post by predicate", async () => {
          const isolationId = makeID();
    
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId}`
          }))
    
          const pendingUpdates = waitForObserve({
            model: Post,
            predicate: p => p.postId('eq', saved.postId)
          });
          await DataStore.delete(saved);
          const updates = await pendingUpdates;
    
          expect(updates.length).toEqual(1);
          expect(updates[0].opType).toEqual('DELETE');
          expect(updates[0].element.title).toEqual(`${getTestName()} - ${isolationId}`);
        });
  
        test("can observe changes from another client", async () => {
          const isolationId = makeID();
  
          const postId_A = makeID();
          const title_A = `${getTestName()} - ${isolationId} - post A`;
          await API.graphql({
            query: mutations.createPost,
            variables: {
              input: {
                postId: postId_A,
                title: title_A,
                _version: 0
              }
            }
          })
          
          const postId_B = makeID();
          const title_B = `${getTestName()} - ${isolationId} - post B`;
          await API.graphql({
            query: mutations.createPost,
            variables: {
              input: {
                postId: postId_B,
                title: title_B,
                _version: 0
              }
            }
          })
  
          const commentId = makeID();
          const content = `${getTestName()} - ${isolationId}`;
  
          const pendingCreates = waitForObserve({
            model: Comment,
            predicate: m => m.commentId("eq", commentId)
          });
  
          await API.graphql({
            query: mutations.createComment,
            variables: {
              input: {
                commentId,
                content,
                postId: postId_A,
                postTitle: title_A,
                _version: 0
              }
            }
          });
  
          const creates = await pendingCreates;
          expect(creates).toBeDefined();
          expect(creates[0].element.content).toEqual(content)
  
          const pendingUpdates = waitForObserve({
            model: Comment,
            predicate: m => m.commentId("eq", commentId)
          });
  
          await API.graphql({
            query: mutations.updateComment,
            variables: {
              input: {
                commentId,
                content,
                postId: postId_B,
                postTitle: title_B,
                _version: 1
              }
            }
          });
  
          const updates = await pendingUpdates;
  
          expect(updates).toBeDefined();
          expect(updates[0].element.content).toEqual(content);
  
          const pendingDeletes = waitForObserve({
            model: Comment,
            predicate: m => m.commentId("eq", commentId)
          });
  
          await API.graphql({
            query: mutations.deleteComment,
            variables: {
              input: {
                commentId,
                content,
                _version: 2
              }
            }
          });
  
          const deletes = await pendingDeletes;
          expect(deletes).toBeDefined();
          expect(deletes[0].element.content).toEqual(content);
          
        });
      });
    });
    
    /**
     * skipped for the sake of time. (but, these should all work)
     */
    describe("observeQuery", () => {
      describe("sanity checks", () => {
        test("can get snapshot containing basic model", async () => {
          const isolationId = makeID();
          const pendingSnapshots = waitForSnapshots({ model: BasicModel });
    
          const saved = await DataStore.save(new BasicModel({
            body: `${getTestName()} - ${isolationId}`
          }));
    
          const snapshots = await pendingSnapshots;
          expect(snapshots.length).toBeGreaterThanOrEqual(1);
    
          const lastSnapshot = snapshots.pop();
          expect(lastSnapshot.length).toBeGreaterThanOrEqual(1);
          expect(lastSnapshot.some(m => m.id === saved.id)).toBe(true);
        });
      });
    
      describe("CPK models", () => {
        test("can get snapshot containing Post (HAS MANY parent) with ALL", async () => {
          const isolationId = makeID();
          const pendingSnapshots = waitForSnapshots({ model: Post });
    
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title: `${getTestName()} - ${isolationId} - post`
          }));
    
          const snapshots = await pendingSnapshots;
          expect(snapshots.length).toBeGreaterThanOrEqual(1);
    
          const lastSnapshot = snapshots.pop();
          expect(lastSnapshot.length).toBeGreaterThanOrEqual(1);
          expect(lastSnapshot.some(post => post.postId === saved.postId)).toBe(true);
        });
    
        test("can get snapshot containing Post (HAS MANY parent) with title predicate", async () => {
          const isolationId = makeID();
    
          const title = `${getTestName()} - ${isolationId} - post`;
          const pendingSnapshots = waitForSnapshots({
            model: Post,
            predicate: p => p.title('eq', title)
          });
    
          const saved = await DataStore.save(new Post({
            postId: makeID(),
            title
          }));
    
          const snapshots = await pendingSnapshots;
          expect(snapshots.length).toBeGreaterThanOrEqual(1);
    
          const lastSnapshot = snapshots.pop();
          expect(lastSnapshot.length).toBeGreaterThanOrEqual(1);
          expect(lastSnapshot.some(post => post.postId === saved.postId)).toBe(true);
        });
    
        test("can get snapshot containing Post (HAS MANY parent) with postId predicate", async () => {
          const isolationId = makeID();
    
          const postId = makeID();
          const pendingSnapshots = waitForSnapshots({
            model: Post,
            predicate: p => p.postId('eq', postId)
          });
    
          const saved = await DataStore.save(new Post({
            postId,
            title: `${getTestName()} - ${isolationId} - post`
          }));
    
          const snapshots = await pendingSnapshots;
          expect(snapshots.length).toBeGreaterThanOrEqual(1);
    
          const lastSnapshot = snapshots.pop();
          expect(lastSnapshot.length).toBeGreaterThanOrEqual(1);
          expect(lastSnapshot.some(post => post.postId === saved.postId)).toBe(true);
        });
      })
    });
    
    describe("Related entity stuff", () => {
      test("can create a comment on a post", async () => {
        const post = await DataStore.save(new Post({
          postId: makeID(),
          title: getTestName() + " post"
        }))
    
        const comment = await DataStore.save(new Comment({
          commentId: makeID(),
          content: getTestName() + " comment",
          post
        }));
    
        expect(comment).toBeDefined();
        expect(comment.commentId).toBeDefined();
        expect(comment.post).toBeDefined();
      });
    
      test("created comment on post can be retrieved by PK with post", async () => {
        const post = await DataStore.save(new Post({
          postId: makeID(),
          title: getTestName() + " post"
        }));
      
        const comment = await DataStore.save(new Comment({
          commentId: makeID(),
          content: getTestName() + " comment",
          post
        }));
      
        const retrieved = await DataStore.query(Comment, {...comment});
      
        expect(retrieved).toBeDefined();
        expect(retrieved.commentId).toEqual(comment.commentId);
        expect(retrieved.content).toEqual(comment.content);
        expect(retrieved.post.postId).toEqual(post.postId);
      });
    
      test("can retrieve comment created on post to be retrieved by post id", async () => {
        const post = await DataStore.save(new Post({
          postId: makeID(),
          title: getTestName() + " post"
        }));
      
        const comment = await DataStore.save(new Comment({
          commentId: makeID(),
          content: getTestName() + " comment",
          post
        }));
    
        const comments = await DataStore.query(
          Comment, comment => comment.postId("eq", post.postId)
        );
    
        expect(comments).toBeDefined();
        expect(comments.length).toEqual(1);
        expect(comments[0].commentId).toEqual(comment.commentId);
        expect(comments[0].post.postId).toEqual(post.postId);
      })
    });
    
    describe.skip("Expected error cases", () => {
      testStart(async () => {
      });
    
      testDone(async () => {
        // await DataStore.clear();
      });
    
      test("cannot delete object that doesn't exist - baseline error", async () => {
        const saved = await DataStore.save(new BasicModel({
          body: `${getTestName()} - basic model`
        }));
    
        const deleted = await DataStore.delete(BasicModel, makeID());
        const retrieved = await DataStore.query(BasicModel, saved.id);
    
        expect(deleted).toEqual([]);
        expect(retrieved).toBeDefined();
      });
    
      test("cannot save a post (HAS_MANY parent) without an ID", async () => {
        const saveOperation = DataStore.save(new Post({
          title: getTestName()
        }));
    
        await expect(saveOperation).rejects.toThrow(/postId is required/);
      });
    
      test("cannot create a comment without an ID", async () => {
        const saveOperation = DataStore.save(new Comment({
          content: getTestName()
        }));
    
        await expect(saveOperation).rejects.toThrow(/commentId is required/);
      });
    });
  
  };